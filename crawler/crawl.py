"""Fetch Serbian media RSS feeds; only store articles matching user keywords."""

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


def load_match_terms(sb: Client) -> list[str]:
    result = sb.table("keywords").select("phrase, search_terms").limit(500).execute()
    terms: list[str] = []
    for row in result.data or []:
        terms.extend(expand_match_terms(row.get("phrase") or "", row.get("search_terms") or []))
    # Dedupe
    seen: set[str] = set()
    out: list[str] = []
    for t in terms:
        key = normalize_for_match(t)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


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


def cleanup_non_matching(sb: Client, terms: list[str]) -> int:
    """Remove stored articles that no longer match any keyword."""
    if not terms:
        # No keywords → clear news pool (stars cascade)
        existing = sb.table("articles").select("id").limit(2000).execute().data or []
        ids = [r["id"] for r in existing]
        deleted = 0
        for i in range(0, len(ids), 100):
            chunk = ids[i : i + 100]
            sb.table("articles").delete().in_("id", chunk).execute()
            deleted += len(chunk)
        return deleted

    rows = (
        sb.table("articles")
        .select("id, title, summary, raw_text_normalized")
        .limit(2000)
        .execute()
        .data
        or []
    )
    to_delete = [r["id"] for r in rows if not article_matches(r, terms)]
    for i in range(0, len(to_delete), 100):
        chunk = to_delete[i : i + 100]
        sb.table("articles").delete().in_("id", chunk).execute()
    return len(to_delete)


def crawl() -> None:
    sb = get_supabase()
    terms = load_match_terms(sb)
    print(f"Active search terms: {len(terms)}")
    if not terms:
        print("No keywords (or AI terms) yet — skipping fetch. Add keywords first.")
        removed = cleanup_non_matching(sb, [])
        print(f"Cleared unmatched pool: removed {removed}")
        return

    matched: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    scanned = 0

    for source in FEED_SOURCES:
        try:
            feed = fetch_feed(source.url)
            entries = feed.entries or []
            print(f"[{source.name}] scanned {len(entries)} from {source.url}")
        except Exception as exc:  # noqa: BLE001
            print(f"[{source.name}] FAILED {source.url}: {exc}", file=sys.stderr)
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
            if article_matches(article, terms):
                matched.append(article)

    matched = matched[:500]
    count = upsert_articles(sb, matched)
    removed = cleanup_non_matching(sb, terms)
    print(
        f"Scanned {scanned} · matched {len(matched)} · upserted {count} · removed stale {removed}"
    )


if __name__ == "__main__":
    crawl()
