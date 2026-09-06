-- Per-user manual-crawl cooldown + custom crawl-source bundles.
-- Additive only: no ALTER/UPDATE on existing user, keyword, article, or hit rows.

create table if not exists public.user_crawl_cooldown (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_triggered_at timestamptz not null default now()
);

alter table public.user_crawl_cooldown enable row level security;

drop policy if exists "user_crawl_cooldown_select_own" on public.user_crawl_cooldown;
create policy "user_crawl_cooldown_select_own"
  on public.user_crawl_cooldown for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.user_crawl_cooldown to authenticated;

comment on table public.user_crawl_cooldown is
  'Per-user 5-minute cooldown for the manual crawl button (shared across keywords)';

create or replace function public.crawl_cooldown_remaining()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  user_left integer := 0;
  global_left integer := 0;
  user_at timestamptz;
  global_at timestamptz;
  user_sec integer := 300;
  global_sec integer := 300;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select last_triggered_at into user_at
  from public.user_crawl_cooldown
  where user_id = auth.uid();

  if user_at is not null then
    user_left := greatest(
      0,
      user_sec - floor(extract(epoch from (now() - user_at)))::integer
    );
  end if;

  select last_triggered_at into global_at
  from public.crawl_dispatch_cooldown
  where id = 1;

  if global_at is not null then
    global_left := greatest(
      0,
      global_sec - floor(extract(epoch from (now() - global_at)))::integer
    );
  end if;

  return greatest(user_left, global_left);
end;
$$;

revoke all on function public.crawl_cooldown_remaining() from public;
grant execute on function public.crawl_cooldown_remaining() to authenticated;

comment on function public.crawl_cooldown_remaining() is
  'Seconds left before this user may dispatch another on-demand crawl';

create table if not exists public.user_source_bundles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('preset', 'rss', 'fuzzy')),
  preset_key text,
  rss_url text,
  enabled boolean not null default true,
  status text not null default 'ready' check (status in ('pending', 'ready', 'error')),
  resolved_feeds jsonb not null default '[]'::jsonb,
  error_text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists user_source_bundles_user_idx
  on public.user_source_bundles (user_id, created_at);

create unique index if not exists user_source_bundles_preset_uidx
  on public.user_source_bundles (user_id, preset_key)
  where preset_key is not null;

create unique index if not exists user_source_bundles_rss_uidx
  on public.user_source_bundles (user_id, rss_url)
  where rss_url is not null;

create unique index if not exists user_source_bundles_label_uidx
  on public.user_source_bundles (user_id, lower(label));

alter table public.user_source_bundles enable row level security;

drop policy if exists "user_source_bundles_select_own" on public.user_source_bundles;
create policy "user_source_bundles_select_own"
  on public.user_source_bundles for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_source_bundles_insert_own" on public.user_source_bundles;
create policy "user_source_bundles_insert_own"
  on public.user_source_bundles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_source_bundles_update_own" on public.user_source_bundles;
create policy "user_source_bundles_update_own"
  on public.user_source_bundles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_source_bundles_delete_own" on public.user_source_bundles;
create policy "user_source_bundles_delete_own"
  on public.user_source_bundles for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_source_bundles to authenticated;

comment on table public.user_source_bundles is
  'Per-user crawl source groups. Zero rows means the built-in Serbia mainstream preset.';
