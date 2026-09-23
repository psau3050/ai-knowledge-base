import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

export interface FakeOpenAIServer {
  baseURL: string;
  requests: RecordedRequest[];
  /** Makes every following request fail with this HTTP status. */
  failWith(status: number | null): void;
  close(): Promise<void>;
}

export interface FakeOpenAIServerOptions {
  dimensions: number;
  /** Defaults to a vector filled with the input length, which lets tests check ordering. */
  embed?: (text: string) => number[];
  /** Chat answer; streamed in two halves. */
  reply?: string;
  /** Model reported in chat responses, like a router (openrouter/auto) that picks one per request. */
  servedModel?: string;
}

/**
 * A tiny server that speaks just enough of the OpenAI API for contract and end-to-end tests: if the
 * app works against this, it works against any provider that implements the same spec.
 */
export async function startFakeOpenAIServer({
  dimensions,
  embed = (text) => Array.from({ length: dimensions }, () => text.length),
  reply = 'Hello',
  servedModel,
}: FakeOpenAIServerOptions): Promise<FakeOpenAIServer> {
  const requests: RecordedRequest[] = [];
  let failureStatus: number | null = null;

  const server = createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (raw += chunk));
    req.on('end', () => {
      const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      requests.push({ path: req.url ?? '', headers: req.headers, body });

      if (failureStatus !== null) {
        return sendJson(res, failureStatus, { error: { message: 'Simulated failure' } });
      }
      if (req.url === '/v1/chat/completions') {
        const model = servedModel ?? String(body.model);
        return body.stream ? streamChat(res, model, reply) : completeChat(res, model, reply);
      }
      if (req.url === '/v1/embeddings') {
        const inputs = Array.isArray(body.input) ? (body.input as string[]) : [String(body.input)];
        const data = inputs.map((text, index) => ({
          object: 'embedding',
          index,
          embedding: embed(text),
        }));
        // Reversed on purpose: rows must be matched by `index`, not by position.
        return sendJson(res, 200, {
          object: 'list',
          model: body.model,
          data: data.reverse(),
          usage: { prompt_tokens: inputs.length, total_tokens: inputs.length },
        });
      }
      sendJson(res, 404, { error: { message: `Unknown route ${req.url}` } });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    failWith: (status) => (failureStatus = status),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const USAGE = { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 };

function completeChat(res: ServerResponse, model: string, reply: string): void {
  sendJson(res, 200, {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
    usage: USAGE,
  });
}

function streamChat(res: ServerResponse, model: string, reply: string): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
    res.write(
      `data: ${JSON.stringify({ id: 'chatcmpl-1', object: 'chat.completion.chunk', created: 0, model, choices, ...extra })}\n\n`,
    );
  const middle = Math.ceil(reply.length / 2);
  chunk([
    {
      index: 0,
      delta: { role: 'assistant', content: reply.slice(0, middle) },
      finish_reason: null,
    },
  ]);
  chunk([{ index: 0, delta: { content: reply.slice(middle) }, finish_reason: null }]);
  chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]);
  chunk([], { usage: USAGE });
  res.end('data: [DONE]\n\n');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
