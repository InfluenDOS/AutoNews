-- Rich result payload for expandable job details in the UI

alter table public.user_jobs
  add column if not exists meta jsonb not null default '{}'::jsonb;

comment on column public.user_jobs.meta is
  'Structured result summary: items[{id,title,url?}], counts, phrases';
