-- AI fields: Chinese keyword expansion + article translation

alter table public.keywords
  add column if not exists search_terms text[] not null default '{}',
  add column if not exists ai_note text not null default '';

alter table public.articles
  add column if not exists title_zh text not null default '',
  add column if not exists summary_zh text not null default '';

comment on column public.keywords.search_terms is 'AI-extracted Serbian/English search terms from Chinese phrase';
comment on column public.keywords.ai_note is 'Short Chinese explanation of how AI interpreted the phrase';
comment on column public.articles.title_zh is 'Chinese translation of title';
comment on column public.articles.summary_zh is 'Chinese translation of summary';
