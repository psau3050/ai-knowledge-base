-- Hybrid retrieval. Semantic candidates (pgvector cosine distance) catch paraphrases; lexical candidates
-- (Postgres full-text search) catch exact terms embeddings blur: names, error codes, identifiers.
-- The two lists are merged with Reciprocal Rank Fusion, which uses only ranks, so the incomparable score
-- scales of the two retrievers never have to be calibrated against each other.
--
-- security invoker: RLS applies inside the function, so a user can only ever retrieve their own chunks.

create function public.match_chunks(
  query_embedding extensions.vector(1024),
  query_text text,
  model text,
  match_count integer default 6,
  candidate_count integer default 40,
  rrf_k integer default 60
)
returns table (
  chunk_id bigint,
  document_id uuid,
  document_title text,
  heading text,
  content text,
  similarity double precision,
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
-- pgvector >= 0.8: keep scanning the HNSW index until enough rows pass the filters (RLS, model), instead
-- of filtering a fixed candidate set and silently returning fewer rows.
set hnsw.iterative_scan = strict_order
as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
      from public.document_chunks c
     where c.embedding_model = model
     order by c.embedding <=> query_embedding
     limit candidate_count
  ),
  lexical as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q) desc) as rank
      from public.document_chunks c,
           websearch_to_tsquery('english', query_text) q
     where c.embedding_model = model
       and c.fts @@ q
     order by ts_rank_cd(c.fts, q) desc
     limit candidate_count
  ),
  fused as (
    select coalesce(s.id, l.id) as id,
           coalesce(1.0 / (rrf_k + s.rank), 0.0) + coalesce(1.0 / (rrf_k + l.rank), 0.0) as score
      from semantic s
      full outer join lexical l on l.id = s.id
  )
  select c.id,
         c.document_id,
         d.title,
         c.heading,
         c.content,
         1 - (c.embedding <=> query_embedding),
         f.score
    from fused f
    join public.document_chunks c on c.id = f.id
    join public.documents d on d.id = c.document_id
   order by f.score desc
   limit match_count;
$$;

revoke execute on function public.match_chunks(extensions.vector, text, text, integer, integer, integer)
  from public, anon;
grant execute on function public.match_chunks(extensions.vector, text, text, integer, integer, integer)
  to authenticated;
