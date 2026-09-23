'use client';

import { DOCUMENT_LIMITS, type DocumentDetail } from '@kb/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { IndexStatusBadge } from '@/components/index-status-badge';
import { MarkdownView } from '@/components/markdown';
import { Button, ErrorNotice, Input, PageHeader, Spinner, Textarea } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import {
  useCreateDocument,
  useDeleteDocument,
  useDocument,
  useReindexDocument,
  useUpdateDocument,
} from '@/lib/queries';

export function NewDocumentEditor() {
  return <EditorForm />;
}

export function ExistingDocumentEditor({ id }: { id: string }) {
  const { data: document, isPending, error } = useDocument(id);
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
  // Remounting on every saved version resets the form from the server's copy, with no syncing effects.
  return <EditorForm key={`${document.id}:${document.updatedAt}`} document={document} />;
}

function parseTags(text: string): string[] {
  const tags = text
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

function EditorForm({ document }: { document?: DocumentDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState(document?.title ?? '');
  const [tagsText, setTagsText] = useState(document?.tags.join(', ') ?? '');
  const [content, setContent] = useState(document?.content ?? '');
  const [preview, setPreview] = useState(false);

  const create = useCreateDocument();
  const update = useUpdateDocument(document?.id ?? '');
  const reindex = useReindexDocument(document?.id ?? '');
  const remove = useDeleteDocument();
  const saving = create.isPending || update.isPending;

  const tags = parseTags(tagsText);
  const dirty =
    !document ||
    title !== document.title ||
    content !== document.content ||
    tags.join() !== document.tags.join();

  function save(event?: FormEvent) {
    event?.preventDefault();
    if (!dirty || saving) return;
    const input = { title, content, tags };
    if (document) update.mutate(input);
    else create.mutate(input, { onSuccess: (doc) => router.replace(`/documents/${doc.id}`) });
  }

  function destroy() {
    if (!document || !window.confirm(`Delete “${document.title}”? This cannot be undone.`)) return;
    remove.mutate(document.id, { onSuccess: () => router.replace('/documents') });
  }

  return (
    <form
      onSubmit={save}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          save();
        }
      }}
      className="flex flex-1 flex-col"
    >
      <PageHeader
        title={document ? 'Edit document' : 'New document'}
        actions={
          <>
            <Link href="/documents" className="px-2 text-sm text-zinc-500 hover:text-zinc-800">
              Back
            </Link>
            {document && (
              <Button variant="danger" onClick={destroy} disabled={remove.isPending}>
                Delete
              </Button>
            )}
            <Button type="submit" disabled={!dirty || saving} aria-keyshortcuts="Control+S Meta+S">
              {saving ? 'Saving & indexing…' : 'Save'}
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <ErrorNotice error={create.error ?? update.error ?? reindex.error ?? remove.error} />

        {document && (
          <IndexingPanel
            document={document}
            reindexing={reindex.isPending}
            onReindex={() => reindex.mutate()}
          />
        )}

        <Input
          aria-label="Title"
          placeholder="Title"
          required
          maxLength={DOCUMENT_LIMITS.titleMax}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-base font-medium"
        />
        <Input
          aria-label="Tags"
          placeholder="Tags, comma separated"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />

        <div className="rounded-md border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1.5 text-xs text-zinc-500">
            <span>Markdown · {content.length.toLocaleString()} characters</span>
            <button
              type="button"
              className="font-medium text-indigo-600 hover:underline"
              onClick={() => setPreview(!preview)}
            >
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="min-h-96 p-4">
              <MarkdownView>{content || '_Nothing to preview._'}</MarkdownView>
            </div>
          ) : (
            <Textarea
              aria-label="Content"
              placeholder="Write or paste Markdown…"
              maxLength={DOCUMENT_LIMITS.contentMax}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-96 rounded-none border-0 font-mono shadow-none focus:ring-0"
            />
          )}
        </div>
      </div>
    </form>
  );
}

function IndexingPanel({
  document,
  reindexing,
  onReindex,
}: {
  document: DocumentDetail;
  reindexing: boolean;
  onReindex: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-zinc-600">
        <IndexStatusBadge status={document.indexStatus} />
        {document.indexStatus === 'failed' && document.indexError ? (
          <span className="text-red-700">{document.indexError}</span>
        ) : document.indexedAt ? (
          <span>
            {document.chunkCount} chunks · {document.embeddingModel} ·{' '}
            {formatDateTime(document.indexedAt)}
          </span>
        ) : null}
      </div>
      <Button variant="secondary" onClick={onReindex} disabled={reindexing}>
        {reindexing ? 'Re-indexing…' : 'Re-index'}
      </Button>
    </div>
  );
}
