-- Chunks of a document with their embeddings: the retrieval index.

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  -- Denormalised from documents so RLS and retrieval filter without a join.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  heading text,
  content text not null,
  token_count integer not null,
  -- Vectors from different models live in different spaces even at the same size, so every row records
  -- its model and retrieval only compares vectors from the currently configured one.
  embedding_model text not null,
  -- 1024 is served natively by bge-m3, bge-large, mxbai-embed-large and LFM2.5-Embedding, and by
  -- OpenAI text-embedding-3-* through the `dimensions` parameter.
  embedding extensions.vector(1024) not null,
  fts tsvector generated always as (to_tsvector('english', coalesce(heading, '') || ' ' || content)) stored,
  unique (document_id, chunk_index)
);

-- HNSW over cosine distance: good recall without the training step IVFFlat needs, and it stays valid as
-- rows are added.
create index document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index document_chunks_fts_idx on public.document_chunks using gin (fts);
create index document_chunks_user_model_idx on public.document_chunks (user_id, embedding_model);

alter table public.document_chunks enable row level security;

create policy "Users can read their own chunks"
  on public.document_chunks for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add chunks to their own documents"
  on public.document_chunks for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own chunks"
  on public.document_chunks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Swaps all chunks of a document in one transaction.
-- Returns false and changes nothing when the document no longer has `p_content_hash`: it was edited while
-- this run was embedding, and the newer run owns the result, so a slow stale run can never win.
create function public.replace_document_chunks(
  p_document_id uuid,
  p_content_hash text,
  p_embedding_model text,
  p_chunks jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Row lock: two runs for the same document serialise here.
  perform 1
    from public.documents
   where id = p_document_id and content_hash = p_content_hash
     for update;
  if not found then
    return false;
  end if;

  delete from public.document_chunks where document_id = p_document_id;

  insert into public.document_chunks
    (document_id, chunk_index, heading, content, token_count, embedding_model, embedding)
  select p_document_id, c.chunk_index, c.heading, c.content, c.token_count, p_embedding_model,
         c.embedding::extensions.vector
    from jsonb_to_recordset(p_chunks)
      as c (chunk_index integer, heading text, content text, token_count integer, embedding text);

  update public.documents
     set index_status = 'ready',
         index_error = null,
         indexed_hash = p_content_hash,
         embedding_model = p_embedding_model,
         indexed_at = now()
   where id = p_document_id;

  return true;
end;
$$;

revoke execute on function public.replace_document_chunks(uuid, text, text, jsonb) from public, anon;
grant execute on function public.replace_document_chunks(uuid, text, text, jsonb) to authenticated;
