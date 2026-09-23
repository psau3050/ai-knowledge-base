/**
 * Minimal Server-Sent Events codec. `EventSource` only supports GET, and chat needs a POST body,
 * so the client reads the stream with `fetch` and this parser.
 */
export function formatSseEvent(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function* readSseEvents<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Normalise on the whole buffer so a CRLF split across two network chunks is still caught.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const data = parseDataLines(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (data !== null) yield JSON.parse(data) as T;
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseDataLines(block: string): string | null {
  const lines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  return lines.length > 0 ? lines.join('\n') : null;
}
