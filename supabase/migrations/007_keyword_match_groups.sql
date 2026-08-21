-- Structured matching for long intents: AND across facet groups, OR within each group.

alter table public.keywords
  add column if not exists match_groups jsonb not null default '[]'::jsonb;

alter table public.keywords
  add column if not exists match_mode text not null default 'loose';

alter table public.keywords
  drop constraint if exists keywords_match_mode_check;

alter table public.keywords
  add constraint keywords_match_mode_check
  check (match_mode in ('loose', 'strict'));

comment on column public.keywords.match_groups is
  'JSON array of groups; each group is an array of language variants. Strict mode requires every group to hit.';

comment on column public.keywords.match_mode is
  'loose = OR of search_terms (short topics); strict = AND of match_groups (long intents).';
