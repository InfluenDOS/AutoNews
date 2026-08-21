-- Per-keyword relevance cache (stage-2 LLM / rule decisions). Avoids re-scoring.

create table if not exists public.article_keyword_relevance (
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  relevant boolean not null,
  created_at timestamptz not null default now(),
  primary key (keyword_id, article_id)
);

create index if not exists article_keyword_relevance_article_idx
  on public.article_keyword_relevance (article_id);

alter table public.article_keyword_relevance enable row level security;

drop policy if exists "akr_select_own" on public.article_keyword_relevance;
create policy "akr_select_own"
  on public.article_keyword_relevance for select
  to authenticated
  using (
    exists (
      select 1 from public.keywords k
      where k.id = article_keyword_relevance.keyword_id
        and k.user_id = auth.uid()
    )
  );

comment on table public.article_keyword_relevance is
  'Stage-2 relevance decisions: keyword_id × article_id, cached to limit LLM cost';
