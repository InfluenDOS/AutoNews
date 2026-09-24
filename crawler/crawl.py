"""Serbian RSS crawl: news sources only, topic shortlist, then AI relevance.

Pipeline:
  1. Scan Serbian (and Serbia-focused) news feeds into a recent pool.
     Culture / Hollywood preview feeds are stored separately and never matched.
  2. Topic shortlist (a place name alone cannot carry a multi-facet keyword).
  3. Download bodies for as many candidates as the budget allows.
  4. Re-shortlist over title + summary + body.
  5. LLM reads the body and decides whether each pair is actually on-topic.
  6. Only approved pairs become permanent article_hits.
  7. Retract historical hits that the new gates would never accept.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser
import httpx
from postgrest.types import ReturnMethod
from supabase import Client, create_client

from extract import fetch_bodies
from normalize import normalize_for_match, recall_score
from relevance import filter_matches_with_relevance, retract_stale_feed
from jobs import ensure_crawl_jobs, ensure_translate_jobs, mark_jobs
from sources import (
    NEWS_SOURCE_NAMES,
    PREVIEW_SOURCE_NAMES,
    is_news_source,
    register_news_names,
)
from story_cluster import cluster_stories
from user_sources import collect_crawl_sources, default_allowed_names, load_source_bundles


USER_AGENT = "AutoNewsBot/1.0 (+https://github.com/AutoNews; RSS aggregator)"

# How many shortlisted articles may have their body downloaded per run.
BODY_FETCH_MAX = int(os.environ.get("BODY_FETCH_MAX", "300"))
# Cap on articles stored as keyword candidates this run (preview pool is separate).
CANDIDATE_STORE_MAX = int(os.environ.get("CANDIDATE_STORE_MAX", "400"))
BUILTIN_SOURCE_NAMES = NEWS_SOURCE_NAMES | PREVIEW_SOURCE_NAMES
# Hour (UTC) of the daily retract pass; see crawl().
RETRACT_HOUR_UTC = int(os.environ.get("RETRACT_HOUR_UTC", "3"))
# Do not reinsert an old URL after retention cleanup merely because it remains
# in a long RSS feed. Missing/unparseable publication dates are still accepted
# and will age out according to articles.created_at.
ARTICLE_RETENTION_DAYS = int(os.environ.get("ARTICLE_RETENTION_DAYS", "20"))


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)
    return create_client(url, key)


def parse_published(entry: dict[str, Any]) -> str | None:
    for key in ("published", "updated", "created"):
        raw = entry.get(key)
        if not raw:
            continue
        try:
            dt = parsedate_to_datetime(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError, IndexError):
            continue
    if entry.get("published_parsed"):
        try:
            t = entry.published_parsed
            dt = datetime(*t[:6], tzinfo=timezone.utc)
            return dt.isoformat()
        except (TypeError, ValueError):
            pass
    return None


def fetch_feed(url: str) -> feedparser.FeedParserDict:
    with httpx.Client(timeout=30.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return feedparser.parse(resp.content)


def entry_to_article(source_name: str, entry: dict[str, Any]) -> dict[str, Any] | None:
    link = (entry.get("link") or "").strip()
    title = (entry.get("title") or "").strip()
    if not link or not title:
        return None
    summary = (entry.get("summary") or entry.get("description") or "").strip()
    if "<" in summary:
        import re

        summary = re.sub(r"<[^>]+>", " ", summary)
        summary = re.sub(r"\s+", " ", summary).strip()
    published_at = parse_published(entry)
    if published_at:
        try:
            published = datetime.fromisoformat(published_at)
            if published < datetime.now(timezone.utc) - timedelta(days=ARTICLE_RETENTION_DAYS):
                return None
        except ValueError:
            pass
    combined = f"{title} {summary}"
    return {
        "source": source_name,
        "title": title[:500],
        "summary": summary[:2000],
        "url": link[:2000],
        "published_at": published_at,
        "raw_text_normalized": normalize_for_match(combined)[:8000],
    }


def load_user_keywords(sb: Client) -> dict[str, list[dict[str, Any]]]:
    """Map user_id -> that user's keyword rows (for per-keyword strict/loose match)."""
    # Widest select first; fall back when a migration has not been applied yet.
    selects = (
        "id, user_id, phrase, search_terms, match_groups, match_mode, exclude_terms",
        "id, user_id, phrase, search_terms, match_groups, match_mode",
        "id, user_id, phrase, search_terms",
    )
    result = None
    for columns in selects:
        try:
            result = sb.table("keywords").select(columns).limit(2000).execute()
            break
        except Exception:  # noqa: BLE001
            continue
    if result is None:
        return {}

    by_user: dict[str, list[dict[str, Any]]] = {}
    for row in result.data or []:
        uid = row.get("user_id")
        if not uid:
            continue
        by_user.setdefault(uid, []).append(row)
    return {uid: rows for uid, rows in by_user.items() if rows}


def matching_keyword_rows(
    article: dict[str, Any],
    user_keywords: dict[str, list[dict[str, Any]]],
    user_allowed: dict[str, set[str]] | None = None,
) -> list[tuple[str, dict[str, Any], int]]:
    """Topic shortlist: (user_id, keyword_row, recall_score). Place-only is not enough."""
    src = article.get("source") or ""
    out: list[tuple[str, dict[str, Any], int]] = []
    for uid, rows in user_keywords.items():
        allowed = user_allowed.get(uid) if user_allowed is not None else None
        if allowed is None:
            allowed = default_allowed_names()
        if src not in allowed:
            continue
        for row in rows:
            score = recall_score(article, row)
            if score > 0:
                out.append((uid, row, score))
    return out


def upsert_articles(sb: Client, articles: list[dict[str, Any]]) -> int:
    """Store articles, dropping `body` when migration 014 has not been applied yet.

    Rows with and without a fetched body are written in separate requests. A bulk
    upsert sends the union of all row keys, so a body-less row mixed into a batch
    would send body=NULL and fail the NOT NULL constraint; a batch that omits the
    column entirely also leaves any body already stored for that URL untouched.

    Articles from users' custom feeds may add new URLs but never overwrite an
    existing row: the articles table is shared, and a feed could otherwise reuse a
    real outlet's article URL to replace its title and summary for everyone.
    """
    if not articles:
        return 0

    def write(rows: list[dict[str, Any]], *, insert_only: bool) -> int:
        total = 0
        for i in range(0, len(rows), 100):
            chunk = rows[i : i + 100]
            result = (
                sb.table("articles")
                .upsert(
                    chunk,
                    on_conflict="url",
                    ignore_duplicates=insert_only,
                    returning=ReturnMethod.minimal,
                )
                .execute()
            )
            total += len(result.data or chunk)
        return total

    def without_body(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [{k: v for k, v in a.items() if k != "body"} for a in rows]

    total = 0
    for insert_only in (False, True):
        group = [a for a in articles if (a.get("source") not in BUILTIN_SOURCE_NAMES) == insert_only]
        total += write(without_body([a for a in group if not a.get("body")]), insert_only=insert_only)
        with_body = [a for a in group if a.get("body")]
        try:
            total += write(with_body, insert_only=insert_only)
        except Exception as exc:  # noqa: BLE001
            print(f"article upsert with body failed ({exc}); retrying without body")
            total += write(without_body(with_body), insert_only=insert_only)
    return total


def resolve_article_ids(sb: Client, urls: list[str]) -> dict[str, str]:
    """url -> article id"""
    out: dict[str, str] = {}
    chunk_size = 100
    for i in range(0, len(urls), chunk_size):
        chunk = urls[i : i + chunk_size]
        rows = sb.table("articles").select("id, url").in_("url", chunk).execute().data or []
        for row in rows:
            out[row["url"]] = row["id"]
    return out


def merge_hits(sb: Client, hits: list[dict[str, str]]) -> int:
    """Append new matches; never remove existing hits (user feed is cumulative)."""
    if not hits:
        return 0
    inserted = 0
    chunk_size = 200
    for i in range(0, len(hits), chunk_size):
        chunk = hits[i : i + chunk_size]
        sb.table("article_hits").upsert(
            chunk, on_conflict="user_id,article_id", returning=ReturnMethod.minimal
        ).execute()
        inserted += len(chunk)
    return inserted


def cleanup_unmatched_batch(
    sb: Client,
    batch_ids: set[str],
    *,
    keep_ids: set[str] | None = None,
) -> int:
    """Slim this-run candidates that never became a hit (and are not starred/preview).

    The rows are kept, not deleted: article_keyword_relevance cascades on article
    delete, so deleting a rejected candidate threw its verdict away and the model
    re-judged the same article on every crawl while it stayed in the RSS feed
    (~9 in 10 relevance calls). Only the heavy text is cleared; the retention job
    removes the rows once they age out.
    """
    if not batch_ids:
        return 0

    keep: set[str] = set(keep_ids or ())
    ids = list(batch_ids)
    chunk_size = 100
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        hit_rows = (
            sb.table("article_hits").select("article_id").in_("article_id", chunk).execute().data
            or []
        )
        keep |= {r["article_id"] for r in hit_rows}
        star_rows = (
            sb.table("stars").select("article_id").in_("article_id", chunk).execute().data or []
        )
        keep |= {r["article_id"] for r in star_rows}

    # Preview-source rows in this batch stay for guest “随便看看”.
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        rows = sb.table("articles").select("id, source").in_("id", chunk).execute().data or []
        keep |= {
            r["id"]
            for r in rows
            if (r.get("source") or "") in PREVIEW_SOURCE_NAMES
        }

    to_slim = [aid for aid in batch_ids if aid not in keep]
    for i in range(0, len(to_slim), 100):
        chunk = to_slim[i : i + 100]
        sb.table("articles").update(
            {"body": "", "raw_text_normalized": ""}, returning=ReturnMethod.minimal
        ).in_("id", chunk).execute()
    return len(to_slim)


def crawl() -> None:
    sb = get_supabase()
    user_keywords = load_user_keywords(sb)
    print(f"Users with keywords: {len(user_keywords)}")
    crawl_feeds, extra_news_names, user_allowed = collect_crawl_sources(load_source_bundles(sb))
    register_news_names(extra_news_names)
    for uid in user_keywords:
        user_allowed.setdefault(uid, default_allowed_names())
    print(f"Crawl feeds: {len(crawl_feeds)} (extra news names {len(extra_news_names)})")
    ensure_crawl_jobs(sb, user_keywords)
    mark_jobs(
        sb,
        step="crawl",
        status="running",
        detail="正在抓取订阅源 RSS，随后由 AI 判定关键词相关性…",
        from_statuses=["queued", "running"],
    )

    pool: list[dict[str, Any]] = []
    preview_articles: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    scanned = 0
    # url -> shortlisted (user_id, keyword_row, recall_score) triples
    url_kw_hits: dict[str, list[tuple[str, dict[str, Any], int]]] = {}

    # ——— Pass 0: scan news feeds into the keyword pool; preview feeds stay separate ———
    for source in crawl_feeds:
        try:
            feed = fetch_feed(source.url)
            entries = feed.entries or []
            print(f"[{source.country}/{source.name}] scanned {len(entries)} from {source.url}")
        except Exception as exc:  # noqa: BLE001
            print(f"[{source.country}/{source.name}] FAILED {source.url}: {exc}", file=sys.stderr)
            continue

        for entry in entries:
            article = entry_to_article(source.name, entry)
            if not article:
                continue
            scanned += 1
            url = article["url"]
            if url in seen_urls:
                continue
            seen_urls.add(url)

            if source.name in PREVIEW_SOURCE_NAMES:
                preview_articles.append(article)
                continue

            if not user_keywords:
                continue
            if is_news_source(source.name):
                pool.append(article)

    if not user_keywords:
        print("No keywords (or AI terms) yet — keeping guest preview pool only.")

    candidates: list[dict[str, Any]] = []
    if user_keywords and pool:
        pool.sort(key=lambda a: a.get("published_at") or "", reverse=True)

        # ——— Pass 1: topic shortlist on title + summary (cheap) ———
        priority: list[tuple[int, dict[str, Any]]] = []
        for article in pool:
            hits = matching_keyword_rows(article, user_keywords, user_allowed)
            score = max((s for _, _, s in hits), default=0)
            if score > 0:
                priority.append((score, article))
        # Strongest shortlist first, then newest within the same score.
        priority.sort(
            key=lambda item: (item[0], item[1].get("published_at") or ""),
            reverse=True,
        )
        priority_articles = [a for _, a in priority]
        priority_urls = {a["url"] for a in priority_articles}

        # Remaining recent articles fill body-fetch slots: terms often live only in the body.
        remainder = [a for a in pool if a["url"] not in priority_urls]
        fetch_list = (priority_articles + remainder)[:BODY_FETCH_MAX]

        bodies = fetch_bodies([a["url"] for a in fetch_list])
        for article in fetch_list:
            body = bodies.get(article["url"], "")
            if body:
                article["body"] = body
        print(
            f"Bodies fetched {len(bodies)}/{len(fetch_list)} "
            f"(topic shortlist {len(priority_articles)}, remainder fill "
            f"{max(0, len(fetch_list) - len(priority_articles))})"
        )

        # ——— Pass 2: re-shortlist over title + summary + body ———
        rescored: list[tuple[int, dict[str, Any]]] = []
        for article in fetch_list:
            hits = matching_keyword_rows(article, user_keywords, user_allowed)
            if not hits:
                continue
            url_kw_hits[article["url"]] = hits
            score = max(s for _, _, s in hits)
            rescored.append((score, article))
        rescored.sort(
            key=lambda item: (item[0], item[1].get("published_at") or ""),
            reverse=True,
        )
        candidates = [a for _, a in rescored][:CANDIDATE_STORE_MAX]
        print(
            f"Bulk pool {len(pool)} · title shortlist {len(priority_articles)} · "
            f"body shortlist {len(rescored)} · storing {len(candidates)}"
        )

    # Public movie/culture pool for guests (dedupe against keyword matches).
    preview_by_url = {a["url"]: a for a in preview_articles}
    for a in candidates:
        preview_by_url.pop(a["url"], None)
    preview_only = list(preview_by_url.values())[:200]

    count = upsert_articles(sb, candidates + preview_only)
    id_by_url = resolve_article_ids(
        sb, [a["url"] for a in candidates] + [a["url"] for a in preview_only]
    )

    stage1_matches: list[dict[str, Any]] = []
    for article in candidates:
        url = article["url"]
        aid = id_by_url.get(url)
        if not aid:
            continue
        for uid, row, score in url_kw_hits.get(url, []):
            kid = row.get("id")
            if not kid:
                continue
            stage1_matches.append(
                {
                    "user_id": uid,
                    "keyword_id": kid,
                    "keyword_phrase": row.get("phrase") or "",
                    "match_mode": row.get("match_mode") or "",
                    "match_groups": row.get("match_groups"),
                    "search_terms": row.get("search_terms"),
                    "exclude_terms": row.get("exclude_terms"),
                    "article_id": aid,
                    "title": article.get("title") or "",
                    "summary": article.get("summary") or "",
                    "body": article.get("body") or "",
                    "source": article.get("source") or "",
                    "recall": score,
                }
            )

    # ——— Pass 3: AI decides relevance; keywords never write hits by themselves ———
    hits = filter_matches_with_relevance(sb, matches=stage1_matches)
    inserted = merge_hits(sb, hits)
    cluster_ids = list({h["article_id"] for h in hits if h.get("article_id")})
    if cluster_ids:
        try:
            cluster_stories(sb, cluster_ids)
        except Exception as exc:  # noqa: BLE001
            print(f"story_cluster after crawl failed: {exc}")
    # The retract pass re-reads every approved article (with body) to re-apply
    # changed gates to old verdicts. That was most of the project's database egress
    # at ~40 crawls a day, so run it once a day; FORCE_RETRACT=1 runs it now.
    retracted = dropped_stale = 0
    if datetime.now(timezone.utc).hour == RETRACT_HOUR_UTC or os.environ.get("FORCE_RETRACT") == "1":
        retracted, dropped_stale = retract_stale_feed(sb, user_keywords)
    else:
        print(f"Retract: skipped (runs during {RETRACT_HOUR_UTC:02d}:00 UTC)")
    # Slim (not delete) this-run candidates that never became hits, so their
    # verdicts stay cached. Matched articles (hits) are kept in full.
    candidate_ids = {id_by_url[u] for u in (a["url"] for a in candidates) if u in id_by_url}
    preview_ids = {id_by_url[u] for u in (a["url"] for a in preview_only) if u in id_by_url}
    slimmed = cleanup_unmatched_batch(sb, candidate_ids, keep_ids=preview_ids)

    # Sample matched article titles for the UI accordion
    sample_items: list[dict[str, str]] = []
    seen_aids: set[str] = set()
    for m in stage1_matches:
        aid = m.get("article_id")
        if not aid or aid in seen_aids:
            continue
        seen_aids.add(str(aid))
        sample_items.append(
            {
                "id": str(aid),
                "title": (m.get("title") or "")[:120],
                "keyword": (m.get("keyword_phrase") or "")[:80],
            }
        )
        if len(sample_items) >= 15:
            break

    phrases_by_user: dict[str, list[str]] = {}
    for m in stage1_matches:
        uid = m.get("user_id")
        phrase = (m.get("keyword_phrase") or "").strip()
        if not uid:
            continue
        bucket = phrases_by_user.setdefault(uid, [])
        if phrase and phrase not in bucket:
            bucket.append(phrase)

    mark_jobs(
        sb,
        step="crawl",
        status="done",
        detail=f"完成 · 候选 {len(candidates)} 篇 · 新 hits {inserted} · 清理旧误匹配 {dropped_stale}",
        meta={
            "counts": {
                "matched": len(candidates),
                "hits": inserted,
                "scanned": scanned,
            },
            "items": sample_items,
            "phrases": sorted({p for ps in phrases_by_user.values() for p in ps}),
        },
        from_statuses=["queued", "running"],
    )
    hit_users = list({h["user_id"] for h in hits})
    if hit_users:
        ensure_translate_jobs(
            sb,
            hit_users,
            detail="等待翻译匹配新闻…",
            phrases_by_user=phrases_by_user,
        )
    print(
        f"Scanned {scanned} · candidate articles {len(candidates)} · preview kept {len(preview_only)} · "
        f"upserted {count} · hits merged {inserted} · unmatched slimmed {slimmed} · "
        f"retracted {retracted} · stale hits dropped {dropped_stale}"
    )


if __name__ == "__main__":
    crawl()
