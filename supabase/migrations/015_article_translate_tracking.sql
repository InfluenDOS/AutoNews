-- Track Chinese-rewrite failures and catch-up backlog (token-cheap retries).

alter table public.articles
  add column if not exists translate_attempts integer not null default 0,
  add column if not exists translate_error text not null default '';

comment on column public.articles.translate_attempts is
  'How many Chinese-rewrite attempts failed; cleared on success';
comment on column public.articles.translate_error is
  'Last rewrite error, or awaiting_catchup when deferred past this run budget';

create index if not exists articles_translate_catchup_idx
  on public.articles (translate_attempts desc, published_at asc)
  where title_zh = '';
