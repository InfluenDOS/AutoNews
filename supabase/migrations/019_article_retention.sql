-- Keep the live article pool small without destroying user favorites.
-- Called by the retention workflow with the service role only.

create or replace function public.purge_old_unstarred_articles(
  p_cutoff timestamptz,
  p_batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with doomed as (
    select a.id
    from public.articles a
    where a.created_at < p_cutoff
      and not exists (
        select 1
        from public.stars s
        where s.article_id = a.id
      )
    order by a.created_at asc, a.id asc
    limit greatest(1, least(coalesce(p_batch_size, 500), 2000))
    for update of a skip locked
  )
  delete from public.articles a
  using doomed d
  where a.id = d.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_old_unstarred_articles(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.purge_old_unstarred_articles(timestamptz, integer)
  to service_role;

comment on function public.purge_old_unstarred_articles(timestamptz, integer) is
  'Deletes old unstarred articles in bounded batches; starred articles are retained.';
