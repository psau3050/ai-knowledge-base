import { describe, expect, it } from 'vitest';
import { formatSseEvent, readSseEvents } from './sse.js';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of readSseEvents(stream)) events.push(event);
  return events;
}

describe('readSseEvents', () => {
  it('round-trips events produced by formatSseEvent', async () => {
    const wire = formatSseEvent({ type: 'delta', text: 'Hel' }) + formatSseEvent({ type: 'done' });
    await expect(collect(streamOf(wire))).resolves.toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'done' },
    ]);
  });

  it('reassembles an event split across network chunks', async () => {
    const wire = formatSseEvent({ type: 'delta', text: 'line one\nline two' });
    const events = await collect(streamOf(wire.slice(0, 7), wire.slice(7, 20), wire.slice(20)));
    expect(events).toEqual([{ type: 'delta', text: 'line one\nline two' }]);
  });

  it('ignores comments and tolerates CRLF line endings', async () => {
    const events = await collect(
      streamOf(': keep-alive\r\n\r\ndata: {"type":"delta","text":"x"}\r\n\r\n'),
    );
    expect(events).toEqual([{ type: 'delta', text: 'x' }]);
  });
});
