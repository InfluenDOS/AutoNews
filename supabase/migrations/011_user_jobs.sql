-- User-visible pipeline jobs (expand / crawl / translate)

create table if not exists public.user_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  keyword_id uuid references public.keywords (id) on delete set null,
  step text not null check (step in ('expand', 'crawl', 'translate')),
  status text not null check (status in ('queued', 'running', 'done', 'error')),
  title text not null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_jobs_user_updated_idx
  on public.user_jobs (user_id, updated_at desc);

create index if not exists user_jobs_user_active_idx
  on public.user_jobs (user_id, status)
  where status in ('queued', 'running');

alter table public.user_jobs enable row level security;

drop policy if exists "user_jobs_select_own" on public.user_jobs;
create policy "user_jobs_select_own"
  on public.user_jobs for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.user_jobs is
  'Pipeline progress for the frontend status banner (expand / crawl / translate)';

-- Realtime so the status banner updates without waiting for poll
do $$
begin
  alter publication supabase_realtime add table public.user_jobs;
exception
  when duplicate_object then null;
end $$;
