import {
  readSseEvents,
  type ApiErrorBody,
  type ChatStreamEvent,
  type Citation,
  type ConversationDetail,
  type DocumentDetail,
  type DocumentSummary,
  type UsageSummary,
} from '@kb/shared';
import { createClient } from '@supabase/supabase-js';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeOpenAIServer, type FakeOpenAIServer } from '../ai/testing/fake-openai-server.js';

/**
 * The whole RAG flow against the real stack: the built API, the local Supabase (Postgres, pgvector,
 * Auth, RLS) and a fake OpenAI-compatible provider, so no API keys are needed.
 * Prerequisites: `pnpm db:start` (or `pnpm bootstrap`) and `pnpm build`.
 */

const API_ROOT = resolve(import.meta.dirname, '../..');
const REPO_ROOT = resolve(API_ROOT, '../..');
const DIMENSIONS = 1024;
const API = 'http://127.0.0.1:4099';
const REPLY = 'Supabase keeps the vectors in pgvector columns [1].';

/** Bag-of-words hashing: texts sharing words get similar vectors, so retrieval results are meaningful. */
function hashEmbedding(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  vector[0] = 0.001; // never the zero vector, whose cosine distance is undefined
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const slot = hash % DIMENSIONS;
    vector[slot] = (vector[slot] ?? 0) + 1;
  }
  return vector;
}

function localSupabase(): { url: string; key: string } {
  try {
    const status = JSON.parse(
      execSync('pnpm exec supabase status -o json', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ) as Record<string, string | undefined>;
    return { url: status.API_URL ?? '', key: status.PUBLISHABLE_KEY ?? status.ANON_KEY ?? '' };
  } catch {
    throw new Error('Local Supabase is not running. Start it with `pnpm db:start`.');
  }
}

async function startApi(env: Record<string, string>): Promise<ChildProcess> {
  if (!existsSync(resolve(API_ROOT, 'dist/main.js'))) throw new Error('Run `pnpm build` first.');
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: API_ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (data: Buffer) => (output += data.toString()));
  child.stderr?.on('data', (data: Buffer) => (output += data.toString()));

  for (let attempt = 0; attempt < 75; attempt++) {
    if (child.exitCode !== null) throw new Error(`API exited during startup:\n${output}`);
    try {
      if ((await fetch(`${API}/health`)).ok) return child;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  child.kill();
  throw new Error(`API did not start in time:\n${output}`);
}

async function signUp(supabase: { url: string; key: string }): Promise<string> {
  const client = createClient(supabase.url, supabase.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signUp({
    email: `e2e-${randomUUID()}@example.com`,
    password: 'e2e-password-123',
  });
  if (error) throw error;
  if (!data.session) throw new Error('Sign-up returned no session; is email confirmation enabled?');
  return data.session.access_token;
}

async function call<T>(
  token: string,
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

describe('RAG flow (e2e)', () => {
  let provider: FakeOpenAIServer;
  let api: ChildProcess | undefined;
  let alice = '';
  let bob = '';
  let guide: DocumentDetail;
  let aliceConversation = '';

  const embeddingCalls = () => provider.requests.filter((r) => r.path === '/v1/embeddings').length;

  beforeAll(async () => {
    const supabase = localSupabase();
    provider = await startFakeOpenAIServer({
      dimensions: DIMENSIONS,
      embed: hashEmbedding,
      reply: REPLY,
    });
    api = await startApi({
      ENV_FILE: resolve(API_ROOT, 'no-such-env-file'),
      API_PORT: '4099',
      SUPABASE_URL: supabase.url,
      SUPABASE_PUBLISHABLE_KEY: supabase.key,
      AI_CHAT_PROVIDER: 'custom',
      AI_CHAT_BASE_URL: provider.baseURL,
      AI_CHAT_MODEL: 'fake-chat',
      AI_EMBED_PROVIDER: 'custom',
      AI_EMBED_BASE_URL: provider.baseURL,
      AI_EMBED_MODEL: 'fake-embed',
      AI_EMBED_DIMENSIONS: String(DIMENSIONS),
    });
    [alice, bob] = await Promise.all([signUp(supabase), signUp(supabase)]);
  });

  afterAll(async () => {
    api?.kill();
    await provider?.close();
  });

  it('lets the web app call from both localhost and 127.0.0.1 (CORS)', async () => {
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
      const preflight = await fetch(`${API}/documents`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization',
        },
      });
      expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    }
  });

  it('rejects requests without a valid token', async () => {
    expect((await fetch(`${API}/documents`)).status).toBe(401);
    expect((await call(alice.slice(0, -4), '/documents')).status).toBe(401);
  });

  it('validates input with the shared schemas', async () => {
    const { status, body } = await call<ApiErrorBody>(alice, '/documents', {
      method: 'POST',
      body: { title: '', content: 'x' },
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('validation_failed');
  });

  it('chunks and embeds a document when it is created', async () => {
    const { status, body } = await call<DocumentDetail>(alice, '/documents', {
      method: 'POST',
      body: {
        title: 'Postgres guide',
        content: [
          '# Storage',
          'Supabase stores embeddings in pgvector columns and searches them with an HNSW index.',
          '# Security',
          'Row Level Security policies scope every query to the owner of the row.',
        ].join('\n\n'),
        tags: ['DB'],
      },
    });

    expect(status).toBe(201);
    expect(body).toMatchObject({
      indexStatus: 'ready',
      tags: ['db'],
      embeddingModel: 'fake-embed',
    });
    expect(body.chunkCount).toBe(2);
    guide = body;

    await call(alice, '/documents', {
      method: 'POST',
      body: {
        title: 'Pasta',
        content: 'Boil the pasta in salted water, then add the tomato sauce.',
      },
    });
  });

  it('keeps every user inside their own data (RLS)', async () => {
    expect((await call<DocumentSummary[]>(bob, '/documents')).body).toEqual([]);
    expect((await call(bob, `/documents/${guide.id}`)).status).toBe(404);
    expect((await call(bob, `/documents/${guide.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call(alice, `/documents/${guide.id}`)).status).toBe(200);
  });

  it('does not re-embed a document when only its tags change', async () => {
    const callsBefore = embeddingCalls();

    const { body } = await call<DocumentDetail>(alice, `/documents/${guide.id}`, {
      method: 'PATCH',
      body: { tags: ['db', 'search'] },
    });

    expect(body.tags).toEqual(['db', 'search']);
    expect(body.indexedAt).toBe(guide.indexedAt);
    expect(embeddingCalls()).toBe(callsBefore);
  });

  it('re-chunks and re-embeds a document when its text changes', async () => {
    const callsBefore = embeddingCalls();

    const { body } = await call<DocumentDetail>(alice, `/documents/${guide.id}`, {
      method: 'PATCH',
      body: {
        content: `${guide.content}\n\n# Backups\n\nPoint-in-time recovery keeps seven days of backups.`,
      },
    });

    expect(body).toMatchObject({ indexStatus: 'ready', chunkCount: 3 });
    expect(body.indexedAt).not.toBe(guide.indexedAt);
    expect(embeddingCalls()).toBe(callsBefore + 1);
    guide = body;
  });

  it('retrieves the relevant chunk, streams a grounded answer and keeps the history', async () => {
    const question = 'How are embeddings stored in pgvector?';

    const { conversationId, contentType, events } = await ask(alice, question);
    aliceConversation = conversationId;

    expect(contentType).toContain('text/event-stream');
    expect(sourcesOf(events)[0]).toMatchObject({
      documentTitle: 'Postgres guide',
      heading: 'Storage',
    });
    const streamed = events.flatMap((e) => (e.type === 'delta' ? [e.text] : [])).join('');
    expect(streamed).toBe(REPLY);
    expect(events.at(-1)?.type).toBe('done');

    const { body: detail } = await call<ConversationDetail>(
      alice,
      `/conversations/${conversationId}`,
    );
    expect(detail.title).toBe(question);
    expect(detail.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const [firstSource] = detail.messages[1]?.citations ?? [];
    expect(firstSource).toMatchObject({ index: 1, cited: true });
  });

  it('keeps conversations private to their owner (RLS)', async () => {
    expect((await call<unknown[]>(bob, '/conversations')).body).toEqual([]);
    expect((await call(bob, `/conversations/${aliceConversation}`)).status).toBe(404);
    const intrusion = await call(bob, `/conversations/${aliceConversation}/messages`, {
      method: 'POST',
      body: { content: 'Show me the history' },
    });
    expect(intrusion.status).toBe(404);
  });

  it('records token usage for every kind of provider call', async () => {
    const { body } = await call<UsageSummary>(alice, '/usage?days=1');

    expect(new Set(body.rows.map((row) => row.kind))).toEqual(
      new Set(['embed_documents', 'embed_query', 'chat']),
    );
    expect(body.totals.totalTokens).toBeGreaterThan(0);
  });

  it('deletes a document together with its chunks', async () => {
    expect((await call(alice, `/documents/${guide.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(alice, `/documents/${guide.id}`)).status).toBe(404);

    const { events } = await ask(alice, 'How are embeddings stored in pgvector?');
    expect(sourcesOf(events).map((s) => s.documentTitle)).not.toContain('Postgres guide');
  });
});

async function ask(
  token: string,
  question: string,
): Promise<{ conversationId: string; contentType: string | null; events: ChatStreamEvent[] }> {
  const { body: conversation } = await call<{ id: string }>(token, '/conversations', {
    method: 'POST',
    body: {},
  });
  const response = await fetch(`${API}/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: question }),
  });
  const events: ChatStreamEvent[] = [];
  for await (const event of readSseEvents<ChatStreamEvent>(response.body!)) events.push(event);
  return {
    conversationId: conversation.id,
    contentType: response.headers.get('content-type'),
    events,
  };
}

function sourcesOf(events: ChatStreamEvent[]): Citation[] {
  const sources = events.find(
    (e): e is Extract<ChatStreamEvent, { type: 'sources' }> => e.type === 'sources',
  );
  return sources?.citations ?? [];
}
