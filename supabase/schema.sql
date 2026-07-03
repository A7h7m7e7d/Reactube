-- ReacTube schema — run this in the Supabase SQL editor (Dashboard → SQL).
-- Implements build plan §4 plus RLS, the report RPC, and server-side rate limiting.

-- ---------------------------------------------------------------- videos
create table if not exists public.videos (
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

-- -------------------------------------------------------------- comments
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null references public.videos (youtube_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  body_text text,
  media_url text,
  media_type text check (media_type in ('image', 'gif', 'sticker')),
  overlay_text text,
  overlay_position jsonb,           -- {x, y, size, color, rotation}
  reported_count int not null default 0,
  score int not null default 0,     -- denormalized vote total, kept by trigger
  created_at timestamptz not null default now(),
  constraint has_content check (body_text is not null or media_url is not null)
);

create index if not exists comments_by_video on public.comments (youtube_id, created_at desc);

alter table public.comments enable row level security;
create policy "comments are readable by everyone" on public.comments
  for select using (true);
create policy "users insert their own comments" on public.comments
  for insert with check (auth.uid() = user_id);
create policy "users delete their own comments" on public.comments
  for delete using (auth.uid() = user_id);

-- Server-side rate limit: max 5 comments per minute per user (plan §7 phase 5)
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

drop trigger if exists comment_rate_limit on public.comments;
create trigger comment_rate_limit before insert on public.comments
  for each row execute function public.enforce_comment_rate_limit();

-- Report RPC: lets any signed-in user bump reported_count without update rights
create or replace function public.report_comment(comment_id uuid)
returns void language sql security definer as $$
  update public.comments
     set reported_count = reported_count + 1
   where id = comment_id;
$$;

-- ------------------------------------------------------------------ votes
-- Reddit-style up/down votes; one vote per user per comment.
create table if not exists public.votes (
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

-- Keep comments.score in sync so feeds can order by it directly
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

drop trigger if exists votes_sync_score on public.votes;
create trigger votes_sync_score after insert or update or delete on public.votes
  for each row execute function public.sync_comment_score();

create index if not exists comments_by_score on public.comments (youtube_id, score desc, created_at desc);

-- ------------------------------------------------------------- favorites
create table if not exists public.favorites (
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

-- ---------------------------------------------------------------- storage
-- Public bucket for user-uploaded comment media (plan §3).
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
