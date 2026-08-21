-- Per-user article matches: each user only sees news hit by their own keywords.

create table if not exists public.article_hits (
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create index if not exists article_hits_user_id_idx on public.article_hits (user_id);
create index if not exists article_hits_article_id_idx on public.article_hits (article_id);
create index if not exists article_hits_user_created_idx on public.article_hits (user_id, created_at desc);

alter table public.article_hits enable row level security;

drop policy if exists "article_hits_select_own" on public.article_hits;
create policy "article_hits_select_own"
  on public.article_hits for select
  to authenticated
  using (auth.uid() = user_id);

-- Articles: only readable if matched for this user, or starred by this user.
drop policy if exists "articles_select_all" on public.articles;
drop policy if exists "articles_select_matched" on public.articles;
create policy "articles_select_matched"
  on public.articles for select
  to authenticated
  using (
    exists (
      select 1
      from public.article_hits h
      where h.article_id = articles.id
        and h.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.stars s
      where s.article_id = articles.id
        and s.user_id = auth.uid()
    )
  );

comment on table public.article_hits is 'Links articles to users whose keywords matched them';
