-- Keep an article's publication time stable once it has been stored.
--
-- Some feeds (N1 live blogs, B92, RTS) move an item's pubDate forward whenever the
-- story is edited. The crawler upserts on url, so every crawl overwrote
-- published_at and the article jumped to the top of the feed. Because feed pages
-- are ordered by published_at, articles moved between pages while readers paged.

-- 1) Repair rows that were already re-dated. An article cannot have been published
--    after the crawler first stored it, so the first-seen time is the best
--    available upper bound. Must run before the trigger below, which would keep
--    the old value.
update public.articles
set published_at = created_at
where published_at > created_at + interval '5 minutes';

-- 2) From now on, the first non-null publication time wins; other columns
--    (title, summary, body) still update normally.
create or replace function public.keep_first_published_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.published_at is not null then
    new.published_at := old.published_at;
  end if;
  return new;
end;
$$;

drop trigger if exists articles_keep_first_published_at on public.articles;
create trigger articles_keep_first_published_at
  before update of published_at on public.articles
  for each row execute function public.keep_first_published_at();

comment on function public.keep_first_published_at() is
  'Feeds re-date edited stories; keep the first stored publication time so feed order is stable.';
