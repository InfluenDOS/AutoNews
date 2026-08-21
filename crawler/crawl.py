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

from normalize import expand_match_terms, matches_keyword, normalize_for_match
from sources import FEED_SOURCES


USER_AGENT = "AutoNewsBot/1.0 (+https://github.com/AutoNews; RSS aggregator)"

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


def load_user_terms(sb: Client) -> dict[str, list[str]]:
    """Map user_id -> deduped match terms from that user's keywords only."""
    result = sb.table("keywords").select("user_id, phrase, search_terms").limit(2000).execute()
    by_user: dict[str, list[str]] = {}
    seen_by_user: dict[str, set[str]] = {}

    for row in result.data or []:
        uid = row.get("user_id")
        if not uid:
            continue
        terms = expand_match_terms(row.get("phrase") or "", row.get("search_terms") or [])
        bucket = by_user.setdefault(uid, [])
        seen = seen_by_user.setdefault(uid, set())
        for term in terms:
            key = normalize_for_match(term)
            if not key or key in seen:
                continue
            seen.add(key)
            bucket.append(term)
    return {uid: terms for uid, terms in by_user.items() if terms}


def article_matches(article: dict[str, Any], terms: list[str]) -> bool:
    if not terms:
        return False
    hay = f"{article.get('title', '')} {article.get('summary', '')}"
    # Prefer pre-normalized text when present, but still enforce word boundaries.
    normalized = article.get("raw_text_normalized") or normalize_for_match(hay)
    for term in terms:
        if matches_keyword(normalized, term) or matches_keyword(hay, term):
            return True
    return False


def matching_user_ids(article: dict[str, Any], user_terms: dict[str, list[str]]) -> list[str]:
    return [uid for uid, terms in user_terms.items() if article_matches(article, terms)]


def upsert_articles(sb: Client, articles: list[dict[str, Any]]) -> int:
    if not articles:
        return 0
    total = 0
    chunk_size = 100
    for i in range(0, len(articles), chunk_size):
        chunk = articles[i : i + chunk_size]
        result = sb.table("articles").upsert(chunk, on_conflict="url").execute()
        total += len(result.data or chunk)
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
    user_terms = load_user_terms(sb)
    print(f"Users with keywords: {len(user_terms)}")

    candidates: list[dict[str, Any]] = []
    preview_articles: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    scanned = 0
    url_users: dict[str, list[str]] = {}

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

            if not user_terms:
                continue
            users = matching_user_ids(article, user_terms)
            if not users:
                continue
            candidates.append(article)
            url_users[url] = users

    if not user_terms:
        print("No keywords (or AI terms) yet — keeping guest preview pool only.")

    # Public movie/culture pool for guests (dedupe against keyword matches).
    preview_by_url = {a["url"]: a for a in preview_articles}
    for a in candidates:
        preview_by_url.pop(a["url"], None)
    preview_only = list(preview_by_url.values())[:200]

    candidates = candidates[:500]
    count = upsert_articles(sb, candidates + preview_only)
    id_by_url = resolve_article_ids(
        sb, [a["url"] for a in candidates] + [a["url"] for a in preview_only]
    )

    hits: list[dict[str, str]] = []
    for article in candidates:
        url = article["url"]
        aid = id_by_url.get(url)
        if not aid:
            continue
        for uid in url_users.get(url, []):
            hits.append({"user_id": uid, "article_id": aid})

    inserted, deleted_hits = replace_hits(sb, hits)
    preview_ids = {id_by_url[u] for u in (a["url"] for a in preview_only) if u in id_by_url}
    removed = cleanup_orphan_articles(sb, preview_ids)
    print(
        f"Scanned {scanned} · matched articles {len(candidates)} · preview kept {len(preview_only)} · "
        f"upserted {count} · hits {inserted} (replaced {deleted_hits}) · removed orphans {removed}"
    )


if __name__ == "__main__":
    crawl()
