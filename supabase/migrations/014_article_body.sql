-- Store the extracted article body, and why the model accepted/rejected a match.
--
-- RSS summaries are 100-500 characters, which is too little text to tell a topic from a
-- passing mention, or `premijer` (prime minister) from `premijera` (premiere). The crawl
-- now downloads the article and keeps its body so relevance scoring and Chinese rewriting
-- both read the real text.

alter table public.articles
  add column if not exists body text not null default '';

comment on column public.articles.body is
  'Extracted article body text (trafilatura); empty when extraction failed.';

alter table public.article_keyword_relevance
  add column if not exists reason text not null default '';

comment on column public.article_keyword_relevance.reason is
  'Short Chinese explanation of the relevance verdict, for debugging match quality.';
