"""Load per-user crawl source bundles without changing default Serbia feeds."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from sources import FEED_SOURCES, FeedSource, NEWS_SOURCES, NEWS_SOURCE_NAMES, PREVIEW_SOURCES

SERBIA_MAINSTREAM_KEY = "serbia_mainstream"

# Articles are attributed and gated by source name, so a user feed may only use a
# built-in name when it is that built-in feed. Otherwise a custom feed labelled
# "Blic" would reach every default subscriber, and one labelled "Variety" would
# land in the guest preview pool.
_BUILTIN_URL_BY_NAME = {s.name.casefold(): s.url for s in FEED_SOURCES}


def _impersonates_builtin(name: str, url: str) -> bool:
    builtin_url = _BUILTIN_URL_BY_NAME.get(name.casefold())
    return builtin_url is not None and builtin_url != url


def _feeds_from_json(raw: Any) -> list[FeedSource]:
    if not isinstance(raw, list):
        return []
    out: list[FeedSource] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        url = str(item.get("url") or "").strip()
        country = str(item.get("country") or "REG").strip() or "REG"
        if not name or not url or url in seen or _impersonates_builtin(name, url):
            continue
        seen.add(url)
        out.append(FeedSource(name=name, url=url, country=country, kind="news"))
    return out


def _host_label(url: str) -> str:
    try:
        host = urlparse(url).hostname or url
    except ValueError:
        return url
    return host.removeprefix("www.")


def default_allowed_names() -> set[str]:
    return set(NEWS_SOURCE_NAMES)


def load_source_bundles(sb: Any) -> list[dict[str, Any]]:
    try:
        result = (
            sb.table("user_source_bundles")
            .select("id, user_id, label, kind, preset_key, rss_url, enabled, status, resolved_feeds")
            .limit(2000)
            .execute()
        )
        return list(result.data or [])
    except Exception:  # noqa: BLE001
        return []


def allowed_names_for_user(rows: list[dict[str, Any]]) -> set[str]:
    """Zero rows → built-in Serbia mainstream. Disabled preset drops those names."""
    if not rows:
        return default_allowed_names()

    preset = next(
        (
            r
            for r in rows
            if r.get("kind") == "preset" and r.get("preset_key") == SERBIA_MAINSTREAM_KEY
        ),
        None,
    )
    names: set[str] = set()
    default_on = preset is None or bool(preset.get("enabled"))
    if default_on:
        names |= default_allowed_names()

    for row in rows:
        if not row.get("enabled") or row.get("status") != "ready":
            continue
        if row.get("kind") == "preset":
            continue
        for feed in _feeds_from_json(row.get("resolved_feeds")):
            names.add(feed.name)
    return names or default_allowed_names()


def collect_crawl_sources(
    bundles: list[dict[str, Any]],
) -> tuple[list[FeedSource], set[str], dict[str, set[str]]]:
    """Return (feeds to fetch, extra news names, user_id -> allowed source names)."""
    by_user: dict[str, list[dict[str, Any]]] = {}
    for row in bundles:
        uid = row.get("user_id")
        if uid:
            by_user.setdefault(uid, []).append(row)

    user_allowed: dict[str, set[str]] = {
        uid: allowed_names_for_user(rows) for uid, rows in by_user.items()
    }

    extra: list[FeedSource] = []
    extra_names: set[str] = set()
    seen_urls = {s.url for s in FEED_SOURCES}
    for row in bundles:
        if not row.get("enabled") or row.get("status") != "ready":
            continue
        if row.get("kind") == "preset":
            continue
        for feed in _feeds_from_json(row.get("resolved_feeds")):
            extra_names.add(feed.name)
            if feed.url in seen_urls:
                continue
            seen_urls.add(feed.url)
            extra.append(feed)

    feeds = [*NEWS_SOURCES, *extra, *PREVIEW_SOURCES]
    return feeds, extra_names, user_allowed
