-- Chat history, persisted per user so conversations survive reloads and sessions.

create type public.message_role as enum ('user', 'assistant');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role public.message_role not null,
  content text not null,
  -- Assistant messages: the chunks shown to the model, each flagged with whether the answer cited it.
  citations jsonb not null default '[]'::jsonb,
  -- The standalone query actually used for retrieval, kept to debug answer quality.
  retrieval_query text,
  model text,
  -- clock_timestamp(): distinct values even within one transaction, so ordering is stable.
  created_at timestamptz not null default clock_timestamp()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row
  when (old.title is distinct from new.title)
  execute function public.touch_updated_at();

-- A new message moves its conversation to the top of the list.
create function public.bump_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_bump_conversation
  after insert on public.messages
  for each row
  execute function public.bump_conversation();

alter table public.conversations enable row level security;

create policy "Users can read their own conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own conversations"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own conversations"
  on public.conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.messages enable row level security;

create policy "Users can read their own messages"
  on public.messages for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add messages to their own conversations"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
