-- Per-keyword source choice. NULL (every existing keyword) keeps the old behaviour:
-- the keyword reads every source its owner has enabled, with the Serbia prompts.
-- Entries are user_source_bundles ids, or 'serbia_mainstream' for the built-in set.
-- Keywords cannot be edited, so the choice is made once, when the keyword is added.

alter table public.keywords
  add column if not exists source_keys text[];

comment on column public.keywords.source_keys is
  'Sources this keyword reads (bundle ids or serbia_mainstream); NULL = all of the user''s sources';
