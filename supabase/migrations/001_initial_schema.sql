-- AutoNews MVP: profiles, keywords, articles, stars + RLS

-- Profiles (bound to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- Keywords per user
create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phrase text not null,
  normalized_phrase text not null,
  created_at timestamptz not null default now(),
  constraint keywords_user_phrase_unique unique (user_id, phrase)
);

create index if not exists keywords_user_id_idx on public.keywords (user_id);
create index if not exists keywords_normalized_idx on public.keywords (normalized_phrase);

-- Articles (public news pool from RSS)
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  summary text not null default '',
  url text not null,
  published_at timestamptz,
  raw_text_normalized text not null default '',
  created_at timestamptz not null default now(),
  constraint articles_url_unique unique (url)
);

create index if not exists articles_published_at_idx on public.articles (published_at desc nulls last);
create index if not exists articles_created_at_idx on public.articles (created_at desc);

-- Stars (favorites)
create table if not exists public.stars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint stars_user_article_unique unique (user_id, article_id)
);

create index if not exists stars_user_id_idx on public.stars (user_id);
create index if not exists stars_article_id_idx on public.stars (article_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Normalize keyword phrase on insert/update (client also normalizes; this is a safety net)
-- Client stores both phrase and normalized_phrase.

-- RLS
alter table public.profiles enable row level security;
alter table public.keywords enable row level security;
alter table public.articles enable row level security;
alter table public.stars enable row level security;

-- Profiles: users read/update own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Keywords: own rows only
drop policy if exists "keywords_select_own" on public.keywords;
create policy "keywords_select_own"
  on public.keywords for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "keywords_insert_own" on public.keywords;
create policy "keywords_insert_own"
  on public.keywords for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "keywords_update_own" on public.keywords;
create policy "keywords_update_own"
  on public.keywords for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "keywords_delete_own" on public.keywords;
create policy "keywords_delete_own"
  on public.keywords for delete
  to authenticated
  using (auth.uid() = user_id);

-- Articles: readable by anyone (anon + authenticated); writes only via service role (crawler)
drop policy if exists "articles_select_all" on public.articles;
create policy "articles_select_all"
  on public.articles for select
  to anon, authenticated
  using (true);

-- Stars: own rows only
drop policy if exists "stars_select_own" on public.stars;
create policy "stars_select_own"
  on public.stars for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "stars_insert_own" on public.stars;
create policy "stars_insert_own"
  on public.stars for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "stars_delete_own" on public.stars;
create policy "stars_delete_own"
  on public.stars for delete
  to authenticated
  using (auth.uid() = user_id);

-- Helpful view: articles with whether current user starred (optional for clients)
-- Clients will query stars separately for simplicity.
