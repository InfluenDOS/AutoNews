"""One-off: ingest culture/movie preview feeds into articles (no hits)."""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv()

from crawl import (  # noqa: E402
    entry_to_article,
    fetch_feed,
    get_supabase,
    upsert_articles,
)
from sources import FEED_SOURCES, PREVIEW_SOURCE_NAMES  # noqa: E402


def main() -> None:
    sb = get_supabase()
    articles = []
    seen = set()
    for source in FEED_SOURCES:
        if source.name not in PREVIEW_SOURCE_NAMES:
            continue
        try:
            feed = fetch_feed(source.url)
            entries = feed.entries or []
            print(f"[{source.name}] {len(entries)}")
        except Exception as exc:  # noqa: BLE001
            print(f"[{source.name}] FAIL {exc}", file=sys.stderr)
            continue
        for entry in entries:
            article = entry_to_article(source.name, entry)
            if not article or article["url"] in seen:
                continue
            seen.add(article["url"])
            articles.append(article)
    articles = articles[:200]
    n = upsert_articles(sb, articles)
    print(f"Upserted {n} preview articles")


if __name__ == "__main__":
    main()
