-- Manual crawl requests + optional GitHub dispatch via pg_net

create schema if not exists private;

create table if not exists private.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;
grant all on all tables in schema private to postgres, service_role;

create table if not exists public.crawl_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued',
  message text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists crawl_requests_user_created_idx
  on public.crawl_requests (user_id, created_at desc);

alter table public.crawl_requests enable row level security;

drop policy if exists "crawl_requests_select_own" on public.crawl_requests;
create policy "crawl_requests_select_own"
  on public.crawl_requests for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "crawl_requests_insert_own" on public.crawl_requests;
create policy "crawl_requests_insert_own"
  on public.crawl_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Enable HTTP from database (Supabase)
create extension if not exists pg_net with schema extensions;

create or replace function public.enqueue_crawl()
returns public.crawl_requests
language plpgsql
security definer
set search_path = public, extensions, private
as $$
declare
  uid uuid := auth.uid();
  recent int;
  req public.crawl_requests;
  token text;
  repo text;
  workflow text;
  url text;
begin
  if uid is null then
    raise exception '请先登录';
  end if;

  select count(*) into recent
  from public.crawl_requests
  where user_id = uid
    and created_at > now() - interval '2 minutes';

  if recent > 0 then
    raise exception '请稍等 2 分钟再手动抓取';
  end if;

  insert into public.crawl_requests (user_id, status, message)
  values (uid, 'queued', '已排队，正在触发抓取…')
  returning * into req;

  select value into token from private.app_secrets where key = 'github_token';
  select coalesce(
    (select value from private.app_secrets where key = 'github_repo'),
    'InfluenDOS/AutoNews'
  ) into repo;
  select coalesce(
    (select value from private.app_secrets where key = 'github_workflow'),
    'crawl.yml'
  ) into workflow;

  if token is null or length(trim(token)) < 10 then
    update public.crawl_requests
      set status = 'error',
          message = '未配置 GitHub Token，无法触发抓取'
    where id = req.id
    returning * into req;
    return req;
  end if;

  url := format(
    'https://api.github.com/repos/%s/actions/workflows/%s/dispatches',
    repo,
    workflow
  );

  perform net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main')
  );

  update public.crawl_requests
    set status = 'triggered',
        message = '已触发抓取任务，约 1～3 分钟后刷新查看'
  where id = req.id
  returning * into req;

  return req;
end;
$$;

revoke all on function public.enqueue_crawl() from public;
grant execute on function public.enqueue_crawl() to authenticated;

create or replace function public.set_app_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = private
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  insert into private.app_secrets (key, value)
  values (p_key, p_value)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
end;
$$;

revoke all on function public.set_app_secret(text, text) from public;
grant execute on function public.set_app_secret(text, text) to service_role;
