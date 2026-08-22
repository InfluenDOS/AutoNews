-- Sense guards: wrong-sense terms that veto a match for an ambiguous translation.

alter table public.keywords
  add column if not exists exclude_terms text[] not null default '{}';

comment on column public.keywords.exclude_terms is
  'Wrong-sense terms that veto a match, e.g. premijera (film premiere) for a premijer (PM) intent.';

-- Lets the crawler re-expand keywords whose terms came from an older prompt.
alter table public.keywords
  add column if not exists expand_version int not null default 0;

comment on column public.keywords.expand_version is
  'Version of the expansion prompt that produced search_terms / match_groups / exclude_terms.';

comment on column public.keywords.match_groups is
  'JSON array of facet groups; each group is an array of language variants. OR within a group, weighted partial AND across groups.';

comment on column public.keywords.match_mode is
  'loose = scored OR of search_terms (short topics); strict = weighted facet coverage over match_groups (long intents).';
