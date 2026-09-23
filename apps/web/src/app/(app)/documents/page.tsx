'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { IndexStatusBadge } from '@/components/index-status-badge';
import { Button, ErrorNotice, Input, PageHeader, Spinner } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useDocuments, useReindexOutdated, useUploadDocument } from '@/lib/queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export default function DocumentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string>();
  const debouncedSearch = useDebouncedValue(search.trim());
  const {
    data: documents,
    isPending,
    error,
  } = useDocuments({
    search: debouncedSearch || undefined,
    tag,
  });

  const upload = useUploadDocument();
  const reindexOutdated = useReindexOutdated();
  const fileInput = useRef<HTMLInputElement>(null);

  const outdated = documents?.filter((doc) => doc.indexStatus !== 'ready').length ?? 0;
  const tags = [
    ...new Set([...(documents ?? []).flatMap((doc) => doc.tags), ...(tag ? [tag] : [])]),
  ].sort();

  return (
    <>
      <PageHeader
        title="Documents"
        actions={
          <>
            {outdated > 0 && (
              <Button
                variant="secondary"
                disabled={reindexOutdated.isPending}
                onClick={() => reindexOutdated.mutate()}
                title="Re-embed documents that are pending, failed or embedded by another model"
              >
                {reindexOutdated.isPending ? 'Re-indexing…' : `Re-index ${outdated} outdated`}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {upload.isPending ? 'Uploading…' : 'Upload file'}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) {
                  upload.mutate(file, { onSuccess: (doc) => router.push(`/documents/${doc.id}`) });
                }
              }}
            />
            <Link
              href="/documents/new"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              New document
            </Link>
          </>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <ErrorNotice error={upload.error ?? reindexOutdated.error} />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            placeholder="Search titles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {tags.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTag(tag === name ? undefined : name)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                tag === name
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50'
              }`}
            >
              #{name}
            </button>
          ))}
        </div>

        {isPending ? (
          <Spinner />
        ) : error ? (
          <ErrorNotice error={error} />
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            {debouncedSearch || tag
              ? 'No documents match.'
              : 'No documents yet. Write one, or upload a PDF, TXT or Markdown file.'}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/documents/${doc.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{doc.title}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      Updated {formatDateTime(doc.updatedAt)}
                      {doc.tags.length > 0 && ` · ${doc.tags.map((t) => `#${t}`).join(' ')}`}
                    </p>
                  </div>
                  <IndexStatusBadge status={doc.indexStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
