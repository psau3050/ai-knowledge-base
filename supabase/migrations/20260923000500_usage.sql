-- One row per AI provider call, so cost can be attributed to users, features and models.

create type public.usage_kind as enum ('chat', 'condense', 'embed_documents', 'embed_query');

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.usage_kind not null,
  provider text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index usage_events_user_created_idx on public.usage_events (user_id, created_at desc);

alter table public.usage_events enable row level security;

create policy "Users can read their own usage"
  on public.usage_events for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can record their own usage"
  on public.usage_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- security_invoker: the view runs with the caller's rights, so RLS on usage_events still applies.
create view public.usage_daily
with (security_invoker = true)
as
select (created_at at time zone 'utc')::date as day,
       kind,
       model,
       count(*) as requests,
       sum(prompt_tokens) as prompt_tokens,
       sum(completion_tokens) as completion_tokens,
       sum(total_tokens) as total_tokens
  from public.usage_events
 group by 1, 2, 3;
