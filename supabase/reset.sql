-- FULL DATABASE RESET for ReacTube.
-- Wipes all app tables, functions, storage and user accounts, then rebuilds
-- everything. Paste the ENTIRE file into the Supabase SQL editor and Run.

-- ------------------------------------------------------------ tear down
drop trigger if exists votes_sync_score on public.votes;
drop trigger if exists comment_rate_limit on public.comments;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.sync_comment_score();
drop function if exists public.enforce_comment_rate_limit();
drop function if exists public.report_comment(uuid);
drop function if exists public.handle_new_user();
drop function if exists public.unread_counts();
drop function if exists public.is_group_member(uuid, uuid);
drop table if exists public.chat_reads cascade;
drop table if exists public.group_messages cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.messages cascade;
drop table if exists public.friendships cascade;
drop table if exists public.profiles cascade;
drop table if exists public.votes cascade;
drop table if exists public.favorites cascade;
drop table if exists public.comments cascade;
drop table if exists public.videos cascade;

-- Storage rows can't be deleted via SQL (Supabase guard). The bucket is
-- kept and reused; to purge uploaded files use Dashboard → Storage.
drop policy if exists "public read of comment media" on storage.objects;
drop policy if exists "users upload to their own folder" on storage.objects;

-- Remove all user accounts (start signups fresh)
delete from auth.users;

-- ------------------------------------------------------------ rebuild
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_id text unique not null,
  title text,
  thumbnail_url text,
  created_at timestamptz not null default now()
);

alter table public.videos enable row level security;
create policy "videos are readable by everyone" on public.videos
  for select using (true);
create policy "anyone signed-in can register a video" on public.videos
  for insert with check (auth.role() = 'authenticated');

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null references public.videos (youtube_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  body_text text,
  media_url text,
  media_type text check (media_type in ('image', 'gif', 'sticker')),
  overlay_text text,
  overlay_position jsonb,
  reported_count int not null default 0,
  score int not null default 0,
  created_at timestamptz not null default now(),
  constraint has_content check (body_text is not null or media_url is not null)
);

create index comments_by_video on public.comments (youtube_id, created_at desc);
create index comments_by_score on public.comments (youtube_id, score desc, created_at desc);

alter table public.comments enable row level security;
create policy "comments are readable by everyone" on public.comments
  for select using (true);
create policy "users insert their own comments" on public.comments
  for insert with check (auth.uid() = user_id);
create policy "users delete their own comments" on public.comments
  for delete using (auth.uid() = user_id);

create or replace function public.enforce_comment_rate_limit()
returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.comments
      where user_id = new.user_id
        and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Rate limit: max 5 comments per minute';
  end if;
  return new;
end $$;

create trigger comment_rate_limit before insert on public.comments
  for each row execute function public.enforce_comment_rate_limit();

create or replace function public.report_comment(comment_id uuid)
returns void language sql security definer as $$
  update public.comments
     set reported_count = reported_count + 1
   where id = comment_id;
$$;

create table public.votes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.votes enable row level security;
create policy "users read their own votes" on public.votes
  for select using (auth.uid() = user_id);
create policy "users cast their own votes" on public.votes
  for insert with check (auth.uid() = user_id);
create policy "users change their own votes" on public.votes
  for update using (auth.uid() = user_id);
create policy "users remove their own votes" on public.votes
  for delete using (auth.uid() = user_id);

create or replace function public.sync_comment_score()
returns trigger language plpgsql security definer as $$
declare
  target uuid := coalesce(new.comment_id, old.comment_id);
begin
  update public.comments
     set score = coalesce((select sum(value) from public.votes where comment_id = target), 0)
   where id = target;
  return null;
end $$;

create trigger votes_sync_score after insert or update or delete on public.votes
  for each row execute function public.sync_comment_score();

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('gif', 'sticker', 'image')),
  source text not null check (source in ('tenor', 'giphy', 'sticker-library', 'upload')),
  created_at timestamptz not null default now(),
  unique (user_id, media_url)
);

alter table public.favorites enable row level security;
create policy "users read their own favorites" on public.favorites
  for select using (auth.uid() = user_id);
create policy "users add their own favorites" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "users remove their own favorites" on public.favorites
  for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('comment-media', 'comment-media', true)
on conflict (id) do nothing;

create policy "public read of comment media" on storage.objects
  for select using (bucket_id = 'comment-media');
create policy "users upload to their own folder" on storage.objects
  for insert with check (
    bucket_id = 'comment-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------- friends & chat rebuild
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "signed-in users can browse profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index friendships_unique_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;
create policy "members see their friendships" on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));
create policy "users send their own requests" on public.friendships
  for insert with check (auth.uid() = requester_id and status = 'pending');
create policy "addressee accepts a request" on public.friendships
  for update using (auth.uid() = addressee_id)
  with check (status = 'accepted');
create policy "either side can remove a friendship" on public.friendships
  for delete using (auth.uid() in (requester_id, addressee_id));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'video', 'comment')),
  body text,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint message_has_content check (body is not null or payload is not null)
);

create index messages_by_friendship on public.messages (friendship_id, created_at);

alter table public.messages enable row level security;
create policy "members read their chat" on public.messages
  for select using (
    exists (
      select 1 from public.friendships f
      where f.id = friendship_id and auth.uid() in (f.requester_id, f.addressee_id)
    )
  );
create policy "friends send messages" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.friendships f
      where f.id = friendship_id
        and f.status = 'accepted'
        and auth.uid() in (f.requester_id, f.addressee_id)
    )
  );

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; end $$;

-- --------------------------------------------- groups & unread rebuild

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

