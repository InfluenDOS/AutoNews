-- Cached same-story verdicts (rule or AI). Avoids re-asking the model.

create table if not exists public.article_story_pairs (
  article_lo uuid not null references public.articles (id) on delete cascade,
  article_hi uuid not null references public.articles (id) on delete cascade,
  same boolean not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (article_lo, article_hi),
  check (article_lo < article_hi)
);

create index if not exists article_story_pairs_hi_idx
  on public.article_story_pairs (article_hi);

create index if not exists article_story_pairs_same_lo_idx
  on public.article_story_pairs (same, article_lo);

alter table public.article_story_pairs enable row level security;

drop policy if exists "asp_select_visible" on public.article_story_pairs;
create policy "asp_select_visible"
  on public.article_story_pairs for select
  to authenticated
  using (
    exists (select 1 from public.articles a where a.id = article_lo)
    and exists (select 1 from public.articles a where a.id = article_hi)
  );

revoke all on public.article_story_pairs from anon;
grant select on public.article_story_pairs to authenticated;
grant select, insert, update, delete on public.article_story_pairs to service_role;

comment on table public.article_story_pairs is
  'Same-event verdicts between two articles (rule or AI), cached to limit LLM cost';
