-- Make the manual-crawl cooldown strictly per-user.
--
-- This only replaces a read-only helper function. It does not alter or delete
-- articles, hits, relevance decisions, stars, keywords, sources, or user jobs.
-- The old crawl_dispatch_cooldown table is intentionally left untouched so the
-- migration is data-preserving and reversible.

create or replace function public.crawl_cooldown_remaining()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  user_at timestamptz;
  user_sec constant integer := 300;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select last_triggered_at into user_at
  from public.user_crawl_cooldown
  where user_id = auth.uid();

  if user_at is null then
    return 0;
  end if;

  return greatest(
    0,
    least(
      user_sec,
      user_sec - floor(extract(epoch from (now() - user_at)))::integer
    )
  );
end;
$$;

revoke all on function public.crawl_cooldown_remaining() from public;
grant execute on function public.crawl_cooldown_remaining() to authenticated;

comment on function public.crawl_cooldown_remaining() is
  'Seconds left before the current user may dispatch another on-demand crawl';
