"""RSS feed source configuration for Serbian mainstream media."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FeedSource:
    name: str
    url: str


# Verified XML RSS endpoints (HTML index pages intentionally omitted).
FEED_SOURCES: list[FeedSource] = [
    FeedSource("Blic", "https://www.blic.rs/rss/vesti"),
    FeedSource("Blic Politika", "https://www.blic.rs/rss/vesti/politika"),
    FeedSource("B92", "https://www.b92.net/info/rss/vesti.xml"),
    FeedSource("RTS", "https://www.rts.rs/page/stories/ci/rss.html"),
    FeedSource("Novosti", "https://www.novosti.rs/rss/vesti"),
]
