import type { Citation } from '@kb/shared';
import Link from 'next/link';

/**
 * Sources the answer cites come first; the rest of what retrieval found is collapsed below them.
 * While an answer is still streaming nothing is marked cited yet, so everything retrieved is shown.
 */
export function Citations({ citations, streaming }: { citations: Citation[]; streaming: boolean }) {
  if (citations.length === 0) return null;
  const cited = citations.filter((c) => c.cited);
  const primary = streaming || cited.length === 0 ? citations : cited;
  const others = primary === citations ? [] : citations.filter((c) => !c.cited);

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {streaming || cited.length === 0 ? 'Retrieved sources' : 'Sources'}
      </p>
      {primary.map((citation) => (
        <Source key={citation.chunkId} citation={citation} />
      ))}
      {others.length > 0 && (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">
            {others.length} more retrieved but not cited
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {others.map((citation) => (
              <Source key={citation.chunkId} citation={citation} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Source({ citation }: { citation: Citation }) {
  return (
    <details className="rounded-md border border-zinc-200 bg-zinc-50 text-xs">
      <summary className="flex cursor-pointer items-baseline gap-2 px-2.5 py-1.5 select-none">
        <span className="font-mono font-semibold text-indigo-600">[{citation.index}]</span>
        <span className="truncate font-medium text-zinc-700">
          {citation.documentTitle}
          {citation.heading && <span className="text-zinc-500"> › {citation.heading}</span>}
        </span>
      </summary>
      <div className="space-y-2 border-t border-zinc-200 px-2.5 py-2">
        <p className="whitespace-pre-wrap text-zinc-600">{citation.snippet}</p>
        <Link
          href={`/documents/${citation.documentId}`}
          className="text-indigo-600 hover:underline"
        >
          Open document
        </Link>
      </div>
    </details>
  );
}
