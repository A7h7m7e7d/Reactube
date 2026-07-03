-- FULL DATABASE RESET for ReacTube.
-- Wipes all app tables, functions, storage and user accounts, then rebuilds
-- everything. Paste the ENTIRE file into the Supabase SQL editor and Run.

-- ------------------------------------------------------------ tear down
drop trigger if exists votes_sync_score on public.votes;
drop trigger if exists comment_rate_limit on public.comments;
drop function if exists public.sync_comment_score();
drop function if exists public.enforce_comment_rate_limit();
drop function if exists public.report_comment(uuid);
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
