'use client';

import { CHAT_LIMITS, type Citation } from '@kb/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Citations } from '@/components/chat/citations';
import { MarkdownView } from '@/components/markdown';
import { Button, ErrorNotice, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { queryKeys, useConversation } from '@/lib/queries';

/** The turn being streamed right now. Persisted messages come from the server once it finishes. */
interface PendingTurn {
  question: string | null;
  answer: string;
  citations: Citation[];
  error: string | null;
}

export function ChatView({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data: conversation, isPending, error } = useConversation(id);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [draft, setDraft] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streaming = pending !== null && pending.question !== null && pending.error === null;

  // Leaving the page stops the answer (and the provider tokens it costs).
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation?.messages.length, pending?.answer, pending?.error]);

  const syncConversation = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.conversation(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
    ]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || streaming) return;

    const abort = new AbortController();
    abortRef.current = abort;
    setDraft('');
    setPending({ question, answer: '', citations: [], error: null });

    const fail = async (message: string) => {
      // The question was saved before the failure; show it from the server, keep only the error here.
      await syncConversation();
      setPending({ question: null, answer: '', citations: [], error: message });
    };

    try {
      for await (const event of api.conversations.send(id, question, abort.signal)) {
        if (event.type === 'sources') {
          setPending((turn) => turn && { ...turn, citations: event.citations });
        } else if (event.type === 'delta') {
          setPending((turn) => turn && { ...turn, answer: turn.answer + event.text });
        } else if (event.type === 'done') {
          await syncConversation();
          setPending(null);
        } else {
          await fail(event.message);
        }
      }
    } catch (err) {
      if (abort.signal.aborted) {
        await syncConversation();
        setPending(null);
      } else {
        await fail(err instanceof Error ? err.message : 'The request failed');
      }
    } finally {
      abortRef.current = null;
    }
  }

  if (isPending)
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  if (error)
    return (
      <div className="p-6">
        <ErrorNotice error={error} />
      </div>
    );

  const empty = conversation.messages.length === 0 && !pending;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="truncate text-lg font-semibold">{conversation.title}</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {empty && (
            <p className="py-16 text-center text-sm text-zinc-500">
              Ask anything about your documents. Answers cite the passages they are based on.
            </p>
          )}
          {conversation.messages.map((message) =>
            message.role === 'user' ? (
              <UserBubble key={message.id} text={message.content} />
            ) : (
              <AssistantBubble
                key={message.id}
                text={message.content}
                citations={message.citations}
              />
            ),
          )}
          {pending?.question && <UserBubble text={pending.question} />}
          {pending && (pending.question || pending.error) && (
            <AssistantBubble
              text={pending.answer}
              citations={pending.citations}
              streaming={streaming}
              error={pending.error}
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={ask} className="border-t border-zinc-200 bg-white p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            aria-label="Your question"
            rows={2}
            placeholder="Ask a question… (Enter to send, Shift+Enter for a new line)"
            maxLength={CHAT_LIMITS.messageMax}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="resize-none"
          />
          {streaming ? (
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!draft.trim()}>
              Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm whitespace-pre-wrap text-white">
        {text}
      </p>
    </div>
  );
}

function AssistantBubble({
  text,
  citations,
  streaming = false,
  error = null,
}: {
  text: string;
  citations: Citation[];
  streaming?: boolean;
  error?: string | null;
}) {
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3">
      {text ? (
        <MarkdownView>{text}</MarkdownView>
      ) : streaming ? (
        <Spinner label={citations.length > 0 ? 'Writing…' : 'Searching your documents…'} />
      ) : null}
      {error && <ErrorNotice error={new Error(error)} />}
      <Citations citations={citations} streaming={streaming} />
    </div>
  );
}
