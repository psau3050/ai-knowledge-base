import Markdown from 'react-markdown';

/** react-markdown renders no raw HTML and sanitises link URLs, so model output is safe to show. */
export function MarkdownView({ children }: { children: string }) {
  return (
    <div className="markdown">
      <Markdown>{children}</Markdown>
    </div>
  );
}
