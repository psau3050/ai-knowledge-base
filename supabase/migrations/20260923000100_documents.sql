-- Documents are the source of truth. Chunks and embeddings (next migration) are a derived index that
-- can always be rebuilt from here.

create extension if not exists vector with schema extensions;

-- Enums rather than text + check: generated TypeScript types become unions, so a typo in a status is a
-- compile error in the API instead of a runtime constraint violation.
create type public.index_status as enum ('pending', 'indexing', 'ready', 'failed');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null default '' check (char_length(content) <= 200000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),

  -- Identity of the text the embeddings are derived from. Tags don't affect retrieval, so a tag-only edit
  -- doesn't trigger re-indexing.
  content_hash text not null generated always as (md5(title || E'\n' || content)) stored,

  -- Indexing state. `indexed_hash` + `embedding_model` describe the chunks that currently exist, which
  -- makes indexing idempotent and lets the API detect chunks built by a model that is no longer configured.
  index_status public.index_status not null default 'pending',
  index_error text,
  indexed_hash text,
  embedding_model text,
  indexed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_user_updated_idx on public.documents (user_id, updated_at desc);
create index documents_tags_idx on public.documents using gin (tags);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Only edits the user makes count as an update; index bookkeeping doesn't reorder the document list.
create trigger documents_touch_updated_at
  before update on public.documents
  for each row
  when (
    old.title is distinct from new.title
    or old.content is distinct from new.content
    or old.tags is distinct from new.tags
  )
  execute function public.touch_updated_at();

alter table public.documents enable row level security;

create policy "Users can read their own documents"
  on public.documents for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own documents"
  on public.documents for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own documents"
  on public.documents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own documents"
  on public.documents for delete to authenticated
  using ((select auth.uid()) = user_id);
