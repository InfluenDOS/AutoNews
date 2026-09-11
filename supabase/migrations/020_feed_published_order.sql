-- Page keyword feeds by the same publication timestamp shown in article cards.

create or replace function public.get_keyword_feed_page(
  p_keyword_id uuid,
  p_offset integer default 0,
  p_limit integer default 20
)
returns table (
  article_id uuid,
  matched_at timestamptz,
  id uuid,
  source text,
  title text,
  summary text,
  title_zh text,
  summary_zh text,
  lead_zh text,
  url text,
  published_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_keyword_id is null then
    return query
      select
        h.article_id,
        h.created_at as matched_at,
        a.id,
        a.source,
        a.title,
        a.summary,
        a.title_zh,
        a.summary_zh,
        a.lead_zh,
        a.url,
        a.published_at,
        a.created_at
      from public.article_hits h
      join public.articles a on a.id = h.article_id
      where h.user_id = auth.uid()
      order by coalesce(a.published_at, a.created_at) desc, a.id desc
      offset greatest(coalesce(p_offset, 0), 0)
      limit greatest(1, least(coalesce(p_limit, 20), 100));
  else
    return query
      select
        r.article_id,
        r.created_at as matched_at,
        a.id,
        a.source,
        a.title,
        a.summary,
        a.title_zh,
        a.summary_zh,
        a.lead_zh,
        a.url,
        a.published_at,
        a.created_at
      from public.article_keyword_relevance r
      join public.keywords k on k.id = r.keyword_id
      join public.articles a on a.id = r.article_id
      where r.keyword_id = p_keyword_id
        and r.relevant = true
        and k.user_id = auth.uid()
      order by coalesce(a.published_at, a.created_at) desc, a.id desc
      offset greatest(coalesce(p_offset, 0), 0)
      limit greatest(1, least(coalesce(p_limit, 20), 100));
  end if;
end;
$$;

revoke all on function public.get_keyword_feed_page(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_keyword_feed_page(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_keyword_feed_page(uuid, integer, integer) is
  'Returns one stable feed page ordered by the article publication time shown to readers.';
