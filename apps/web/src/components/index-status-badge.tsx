import type { IndexStatus } from '@kb/shared';

const STATUS: Record<IndexStatus, { label: string; hint: string; className: string }> = {
  pending: { label: 'Pending', hint: 'Not indexed yet', className: 'bg-zinc-100 text-zinc-600' },
  indexing: {
    label: 'Indexing',
    hint: 'Chunking and embedding',
    className: 'bg-amber-50 text-amber-700',
  },
  ready: {
    label: 'Indexed',
    hint: 'Searchable in chat',
    className: 'bg-emerald-50 text-emerald-700',
  },
  failed: {
    label: 'Failed',
    hint: 'Indexing failed. Open the document to retry.',
    className: 'bg-red-50 text-red-700',
  },
  stale: {
    label: 'Stale',
    hint: 'Embedded with a different model than the one configured now. Re-index to search it.',
    className: 'bg-orange-50 text-orange-700',
  },
};

export function IndexStatusBadge({ status }: { status: IndexStatus }) {
  const { label, hint, className } = STATUS[status];
  return (
    <span
      title={hint}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
