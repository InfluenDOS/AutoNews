"""RSS feed sources for AutoNews.

Keyword crawl uses Serbian (and Serbia-focused) news outlets. Culture / Hollywood
feeds are ingested only for the guest “随便看看” movie preview and never enter
keyword matching — mixing them in is how entertainment junk reached subscriptions.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FeedSource:
    name: str
    url: str
    country: str  # ISO 3166-1 alpha-2 style code (XK for Kosovo)
    kind: str = "news"  # "news" (keyword crawl) or "preview" (guest pool only)


# Verified XML/Atom endpoints (HTML index pages intentionally omitted).
NEWS_SOURCES: list[FeedSource] = [
    FeedSource("Blic", "https://www.blic.rs/rss/vesti", "RS"),
    FeedSource("Blic Politika", "https://www.blic.rs/rss/vesti/politika", "RS"),
    FeedSource("B92", "https://www.b92.net/info/rss/vesti.xml", "RS"),
    FeedSource("RTS", "https://www.rts.rs/page/stories/ci/rss.html", "RS"),
    FeedSource("Novosti", "https://www.novosti.rs/rss/vesti", "RS"),
    FeedSource("N1 Serbia", "https://n1info.rs/feed/", "RS"),
    FeedSource("Danas", "https://www.danas.rs/feed/", "RS"),
    # Regional investigative outlet; serbia-news-bot also uses this feed.
    FeedSource("Balkan Insight", "https://balkaninsight.com/feed/", "REG"),
]

# Guest movie/culture pool only. Do not keyword-match these.
PREVIEW_SOURCES: list[FeedSource] = [
    FeedSource("Blic Kultura", "https://www.blic.rs/rss/kultura", "RS", "preview"),
    FeedSource("Blic Zabava", "https://www.blic.rs/rss/zabava", "RS", "preview"),
    FeedSource("B92 Kultura", "https://www.b92.net/info/rss/kultura.xml", "RS", "preview"),
    FeedSource("Novosti Kultura", "https://www.novosti.rs/rss/kultura", "RS", "preview"),
    FeedSource("Variety", "https://variety.com/feed/", "REG", "preview"),
]

FEED_SOURCES: list[FeedSource] = [*NEWS_SOURCES, *PREVIEW_SOURCES]

NEWS_SOURCE_NAMES = {s.name for s in NEWS_SOURCES}
PREVIEW_SOURCE_NAMES = {s.name for s in PREVIEW_SOURCES}


def is_news_source(name: str | None) -> bool:
    return (name or "") in NEWS_SOURCE_NAMES
