-- Singleton cooldown for on-demand crawl dispatches (does not affect hourly cron).

create table if not exists public.crawl_dispatch_cooldown (
  id int primary key default 1 check (id = 1),
  last_triggered_at timestamptz,
  last_by uuid references auth.users (id) on delete set null
);

alter table public.crawl_dispatch_cooldown enable row level security;
-- no client policies: service role only
