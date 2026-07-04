-- ReacTube friends & chat — run this in the Supabase SQL editor (Dashboard → SQL).
-- Adds: profiles (searchable user directory), friendships (requests), messages
-- (direct chat incl. shared videos / shared comments), and realtime for chat.

-- ---------------------------------------------------------------- profiles
-- Public-ish mirror of auth.users so signed-in people can find each other.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "signed-in users can browse profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Keep profiles in sync with signups (rows are written by this trigger only)
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that signed up before this migration
insert into public.profiles (id, display_name, email)
select id,
       coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1)),
       email
from auth.users
on conflict (id) do nothing;

-- ------------------------------------------------------------- friendships
-- One row per relationship. requester sends, addressee accepts (or deletes).
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- No duplicate pair in either direction
create unique index if not exists friendships_unique_pair
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

-- ---------------------------------------------------------------- messages
-- Chat between two friends. kind:
--   'text'    → body only
--   'video'   → payload {youtube_id, title, thumbnail_url}
--   'comment' → payload {youtube_id, video_title, comment {display_name, body_text,
--                media_url, media_type, overlay_text, overlay_position}}
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.friendships (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'video', 'comment')),
  body text,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint message_has_content check (body is not null or payload is not null)
);

create index if not exists messages_by_friendship
  on public.messages (friendship_id, created_at);

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

-- ---------------------------------------------------------------- realtime
-- Live chat + live friend-request badge (RLS still applies to subscribers).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; end $$;
