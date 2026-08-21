-- Allow anonymous visitors to browse a public article preview pool
-- (logged-in users still only see matched / starred articles via articles_select_matched).

drop policy if exists "articles_select_anon_preview" on public.articles;
create policy "articles_select_anon_preview"
  on public.articles for select
  to anon
  using (true);

comment on policy "articles_select_anon_preview" on public.articles is
  'Public preview for guests on keywords landing; authenticated users use articles_select_matched';
