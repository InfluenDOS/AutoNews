"""Near-duplicate story detection for crawl-time hit skipping and tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from normalize import normalize_for_match

TITLE_JACCARD_THRESHOLD = 0.65
TIME_WINDOW = timedelta(hours=6)


def _cjk_bigrams(text: str) -> set[str]:
    chars = [ch for ch in text if not ch.isspace()]
    if len(chars) < 4:
        return {text} if text else set()
    return {"".join(chars[i : i + 2]) for i in range(len(chars) - 1)}


def title_tokens(title: str) -> set[str]:
    norm = normalize_for_match(title)
    parts = [t for t in norm.split() if len(t) >= 2]
    if len(parts) >= 2:
        return set(parts)
    blob = parts[0] if parts else "".join(ch for ch in norm if not ch.isspace())
    if any("\u4e00" <= ch <= "\u9fff" for ch in blob):
        return _cjk_bigrams(blob)
    return set(parts) if parts else ({norm} if norm else set())


def title_jaccard(a: str, b: str) -> float:
    left = title_tokens(a)
    right = title_tokens(b)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def titles_similar(a: str, b: str, *, threshold: float = TITLE_JACCARD_THRESHOLD) -> bool:
    left = title_tokens(a)
    right = title_tokens(b)
    if not left or not right:
        return False
    inter = len(left & right)
    if inter / len(left | right) >= threshold:
        return True
    return inter / min(len(left), len(right)) >= 0.75


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def published_close(
    a: str | None,
    b: str | None,
    *,
    window: timedelta = TIME_WINDOW,
) -> bool:
    da = _parse_dt(a)
    db = _parse_dt(b)
    if not da or not db:
        return True
    if abs(da - db) <= window:
        return True
    return da.date() == db.date()


def titles_near_duplicate(
    title_a: str,
    title_b: str,
    published_a: str | None = None,
    published_b: str | None = None,
    *,
    threshold: float = TITLE_JACCARD_THRESHOLD,
) -> bool:
    if not published_close(published_a, published_b):
        return False
    return titles_similar(title_a, title_b, threshold=threshold)


def articles_near_duplicate(
    a: dict[str, Any],
    b: dict[str, Any],
    *,
    threshold: float = TITLE_JACCARD_THRESHOLD,
) -> bool:
    if not published_close(a.get("published_at"), b.get("published_at")):
        return False
    if titles_similar(str(a.get("title") or ""), str(b.get("title") or ""), threshold=threshold):
        return True
    zh_a = str(a.get("title_zh") or "")
    zh_b = str(b.get("title_zh") or "")
    return bool(zh_a and zh_b and titles_similar(zh_a, zh_b, threshold=threshold))


def drop_near_duplicate_hits(
    new_hits: list[dict[str, str]],
    *,
    new_meta: dict[str, dict[str, Any]],
    existing: dict[str, list[dict[str, Any]]],
) -> list[dict[str, str]]:
    """Skip a new hit when the user already has a same-day similar title.

    Does not mutate existing hits. `existing` maps user_id -> article dicts
    with title / published_at. `new_meta` maps article_id -> the same fields.
    """
    kept: list[dict[str, str]] = []
    accepted: dict[str, list[dict[str, Any]]] = {uid: list(rows) for uid, rows in existing.items()}

    for hit in new_hits:
        uid = hit.get("user_id") or ""
        aid = hit.get("article_id") or ""
        meta = new_meta.get(aid) or {}
        title = str(meta.get("title") or "")
        published = meta.get("published_at")
        if not uid or not aid or not title:
            kept.append(hit)
            continue

        prior = accepted.setdefault(uid, [])
        if any(
            articles_near_duplicate(
                {"title": title, "title_zh": meta.get("title_zh") or "", "published_at": published},
                row,
            )
            for row in prior
        ):
            continue

        kept.append(hit)
        prior.append({"title": title, "published_at": published, "id": aid})
    return kept
