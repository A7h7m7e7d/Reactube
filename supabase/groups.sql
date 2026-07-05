-- ReacTube groups & unread messages — run this in the Supabase SQL editor.
-- Adds: group chats (groups / group_members / group_messages), per-user
-- read markers (chat_reads), and an unread_counts() RPC for badges.

-- -------------------------------------------------------------- chat reads
-- One row per user per conversation: "I have read everything up to here".
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chat_kind text not null check (chat_kind in ('friend', 'group')),
  chat_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, chat_kind, chat_id)
);

alter table public.chat_reads enable row level security;
create policy "users read their own read markers" on public.chat_reads
  for select using (auth.uid() = user_id);
create policy "users set their own read markers" on public.chat_reads
  for insert with check (auth.uid() = user_id);
create policy "users update their own read markers" on public.chat_reads
  for update using (auth.uid() = user_id);

-- ------------------------------------------------------------------ groups
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Membership check as security definer, so RLS policies can use it without
-- the classic "group_members policy queries group_members" infinite recursion.
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid);
$$;

alter table public.groups enable row level security;
create policy "members and owner see the group" on public.groups
  for select using (owner_id = auth.uid() or public.is_group_member(id, auth.uid()));
create policy "users create their own groups" on public.groups
  for insert with check (owner_id = auth.uid());
create policy "owner deletes the group" on public.groups
  for delete using (owner_id = auth.uid());

alter table public.group_members enable row level security;
create policy "members see the member list" on public.group_members
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "owner adds members" on public.group_members
  for insert with check (
    exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );
create policy "self-leave or owner removes" on public.group_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

-- ---------------------------------------------------------- group messages
-- Same shape as messages (text / shared video / shared comment), plus the
-- sender's display_name since group chats need to label who said what.
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  kind text not null default 'text' check (kind in ('text', 'video', 'comment')),
  body text,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint group_message_has_content check (body is not null or payload is not null)
);

create index if not exists group_messages_by_group
  on public.group_messages (group_id, created_at);

alter table public.group_messages enable row level security;
create policy "members read group chat" on public.group_messages
  for select using (public.is_group_member(group_id, auth.uid()));
create policy "members send group messages" on public.group_messages
  for insert with check (auth.uid() = sender_id and public.is_group_member(group_id, auth.uid()));

-- ---------------------------------------------------------- unread counts
-- Per-conversation unread counts for the calling user, for badges.
create or replace function public.unread_counts()
returns table (chat_kind text, chat_id uuid, unread bigint)
language sql security definer set search_path = public as $$
  select 'friend'::text, m.friendship_id, count(*)
  from public.messages m
  join public.friendships f on f.id = m.friendship_id
  where auth.uid() in (f.requester_id, f.addressee_id)
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(
      (select r.last_read_at from public.chat_reads r
        where r.user_id = auth.uid() and r.chat_kind = 'friend' and r.chat_id = m.friendship_id),
      'epoch'::timestamptz)
  group by m.friendship_id
  union all
  select 'group'::text, gm.group_id, count(*)
  from public.group_messages gm
  join public.group_members me on me.group_id = gm.group_id and me.user_id = auth.uid()
  where gm.sender_id <> auth.uid()
    and gm.created_at > coalesce(
      (select r.last_read_at from public.chat_reads r
        where r.user_id = auth.uid() and r.chat_kind = 'group' and r.chat_id = gm.group_id),
      'epoch'::timestamptz)
  group by gm.group_id;
$$;

-- ---------------------------------------------------------------- realtime
do $$ begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.group_members;
exception when duplicate_object then null; end $$;
