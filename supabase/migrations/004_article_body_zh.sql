-- Longer Chinese body for in-site article detail pages

alter table public.articles
  add column if not exists body_zh text not null default '',
  add column if not exists lead_zh text not null default '';

comment on column public.articles.lead_zh is 'Chinese one-sentence lead / dek';
comment on column public.articles.body_zh is 'Chinese multi-paragraph news brief for detail page';
