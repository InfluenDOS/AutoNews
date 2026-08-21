-- Cleanup: remove unused manual-crawl stack, redundant indexes,
-- and tighten guest article preview policy.

-- 1) Manual crawl (UI removed; app uses KeywordsContext + hourly Actions only)
drop function if exists public.enqueue_crawl();
drop function if exists public.set_app_secret(text, text);

drop table if exists public.crawl_requests;

drop table if exists private.app_secrets;

-- 2) Redundant indexes (covered by PK / composite uniques)
drop index if exists public.article_hits_user_id_idx;
drop index if exists public.stars_user_id_idx;
-- normalized_phrase is stored but never queried by the app/crawler
drop index if exists public.keywords_normalized_idx;

-- 3) Guest preview: was using (true) = entire article table.
--    Limit to culture/movie sources kept by the crawler preview pool.
drop policy if exists "articles_select_anon_preview" on public.articles;
create policy "articles_select_anon_preview"
  on public.articles for select
  to anon
  using (
    source in (
      'Blic Kultura',
      'Blic Zabava',
      'B92 Kultura',
      'Novosti Kultura',
      'Variety'
    )
  );

comment on policy "articles_select_anon_preview" on public.articles is
  'Guest preview limited to crawler PREVIEW_SOURCE_NAMES; authenticated users use articles_select_matched';
