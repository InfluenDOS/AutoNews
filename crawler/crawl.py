"""Fetch Serbian media RSS feeds; store articles and per-user keyword hits."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser
import httpx
from supabase import Client, create_client

from extract import fetch_bodies
from normalize import normalize_for_match, recall_score
from relevance import filter_matches_with_relevance
from jobs import ensure_crawl_jobs, ensure_translate_jobs, mark_jobs
from sources import FEED_SOURCES


USER_AGENT = "AutoNewsBot/1.0 (+https://github.com/AutoNews; RSS aggregator)"

# How many shortlisted articles may have their body downloaded per run.
BODY_FETCH_MAX = int(os.environ.get("BODY_FETCH_MAX", "300"))

# Always keep these feeds in the public pool (guest “随便看看”).
PREVIEW_SOURCE_NAMES = {
    "Blic Kultura",
    "Blic Zabava",
    "B92 Kultura",
    "Novosti Kultura",
    "Variety",
}


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
    combined = f"{title} {summary}"
    return {
        "source": source_name,
        "title": title[:500],
        "summary": summary[:2000],
        "url": link[:2000],
        "published_at": parse_published(entry),
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
    article: dict[str, Any], user_keywords: dict[str, list[dict[str, Any]]]
) -> list[tuple[str, dict[str, Any], int]]:
    """Shortlist: (user_id, keyword_row, recall_score) for keywords with any term present."""
    out: list[tuple[str, dict[str, Any], int]] = []
    for uid, rows in user_keywords.items():
        for row in rows:
            score = recall_score(article, row)
            if score > 0:
                out.append((uid, row, score))
    return out


def upsert_articles(sb: Client, articles: list[dict[str, Any]]) -> int:
    """Store articles, dropping `body` when migration 014 has not been applied yet."""
    if not articles:
        return 0

    def write(rows: list[dict[str, Any]]) -> int:
        total = 0
        for i in range(0, len(rows), 100):
            chunk = rows[i : i + 100]
            result = sb.table("articles").upsert(chunk, on_conflict="url").execute()
            total += len(result.data or chunk)
        return total

    try:
        return write(articles)
    except Exception as exc:  # noqa: BLE001
        print(f"article upsert with body failed ({exc}); retrying without body")
        return write([{k: v for k, v in a.items() if k != "body"} for a in articles])


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


def replace_hits(sb: Client, hits: list[dict[str, str]]) -> tuple[int, int]:
    """Full rebuild of article_hits for correctness after each crawl."""
    existing = sb.table("article_hits").select("user_id, article_id").limit(20000).execute().data or []
    deleted = 0
    if existing:
        # delete in chunks by article_id groups
        ids = list({f"{r['user_id']}|{r['article_id']}" for r in existing})
        # simpler: delete all via service role — use neq trick on created_at
        sb.table("article_hits").delete().gte("created_at", "1970-01-01").execute()
        deleted = len(ids)

    inserted = 0
    chunk_size = 200
    for i in range(0, len(hits), chunk_size):
        chunk = hits[i : i + chunk_size]
        sb.table("article_hits").upsert(chunk, on_conflict="user_id,article_id").execute()
        inserted += len(chunk)
    return inserted, deleted


def cleanup_orphan_articles(sb: Client, keep_ids: set[str] | None = None) -> int:
    """Remove articles that no user currently matches (stars cascade with article)."""
    articles = sb.table("articles").select("id, source").limit(5000).execute().data or []
    if not articles:
        return 0
    hit_rows = sb.table("article_hits").select("article_id").limit(20000).execute().data or []
    keep = {r["article_id"] for r in hit_rows}
    # keep starred articles even without hits
    star_rows = sb.table("stars").select("article_id").limit(20000).execute().data or []
    keep |= {r["article_id"] for r in star_rows}
    if keep_ids:
        keep |= keep_ids
    # keep guest-preview culture / movie feeds
    keep |= {
        r["id"]
        for r in articles
        if (r.get("source") or "") in PREVIEW_SOURCE_NAMES
    }

    to_delete = [r["id"] for r in articles if r["id"] not in keep]
    for i in range(0, len(to_delete), 100):
        chunk = to_delete[i : i + 100]
        sb.table("articles").delete().in_("id", chunk).execute()
    return len(to_delete)


def crawl() -> None:
    sb = get_supabase()
    user_keywords = load_user_keywords(sb)
    print(f"Users with keywords: {len(user_keywords)}")
    ensure_crawl_jobs(sb, user_keywords)
    mark_jobs(
        sb,
        step="crawl",
        status="running",
        detail="正在抓取 RSS 并匹配关键词…",
        from_statuses=["queued", "running"],
    )

    candidates: list[dict[str, Any]] = []
    preview_articles: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    scanned = 0
    # url -> shortlisted (user_id, keyword_row, recall_score) triples
    url_kw_hits: dict[str, list[tuple[str, dict[str, Any], int]]] = {}

    for source in FEED_SOURCES:
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

            if not user_keywords:
                continue
            # Pass 1 on title + summary: cheap, and decides whose body is worth downloading.
            if not matching_keyword_rows(article, user_keywords):
                continue
            candidates.append(article)

    if not user_keywords:
        print("No keywords (or AI terms) yet — keeping guest preview pool only.")

    candidates = candidates[:500]

    # Download the bodies, then redo recall over the full text. An RSS summary is a few
    # hundred characters; terms regularly appear only further down the article.
    body_targets = [a["url"] for a in candidates][:BODY_FETCH_MAX]
    bodies = fetch_bodies(body_targets)
    for article in candidates:
        body = bodies.get(article["url"], "")
        if body:
            article["body"] = body
    print(f"Bodies fetched {len(bodies)}/{len(body_targets)}")

    for article in candidates:
        hits = matching_keyword_rows(article, user_keywords)
        if hits:
            url_kw_hits[article["url"]] = hits
    candidates = [a for a in candidates if a["url"] in url_kw_hits]

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
                    "recall": score,
                }
            )

    hits = filter_matches_with_relevance(sb, matches=stage1_matches)
    inserted, deleted_hits = replace_hits(sb, hits)
    preview_ids = {id_by_url[u] for u in (a["url"] for a in preview_only) if u in id_by_url}
    removed = cleanup_orphan_articles(sb, preview_ids)

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
        detail=f"完成 · 匹配 {len(candidates)} 篇 · hits {inserted}",
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
        f"Scanned {scanned} · matched articles {len(candidates)} · preview kept {len(preview_only)} · "
        f"upserted {count} · hits {inserted} (replaced {deleted_hits}) · removed orphans {removed}"
    )


if __name__ == "__main__":
    crawl()
