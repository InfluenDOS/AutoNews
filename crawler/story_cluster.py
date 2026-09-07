"""Same-event clustering: cheap prefilter, optional AI, cached in article_story_pairs."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from ai_client import ai_configured, chat_json
from dedup import TITLE_JACCARD_THRESHOLD, published_close, title_jaccard, title_tokens
from extract import clip_text

STORY_DEDUP_BATCH = int(os.environ.get("STORY_DEDUP_BATCH", "8"))
STORY_DEDUP_MAX_PAIRS = int(os.environ.get("STORY_DEDUP_MAX_PAIRS", "80"))
RECENT_HOURS = int(os.environ.get("STORY_DEDUP_WINDOW_HOURS", "48"))
WEAK_TOKEN_OVERLAP = 4

STORY_SYSTEM = """你是新闻去重审核员。判断两篇稿是否报道**同一新闻事件**：同一时间、地点、主体、动作。
改写、翻译、详略不同、不同报社仍算同一件。
两起不同的同类事件（例如两起不同的逮捕或行贿）必须判 false。
只依据给出的来源、标题与摘要，不要臆造。拿不准一律 false。
只输出 JSON：{"results":[{"a":"id","b":"id","same":true/false,"reason":"一句中文理由"}]}
results 必须覆盖用户给出的每一对。"""


def pair_key(a: str, b: str) -> tuple[str, str]:
    lo, hi = sorted((a, b))
    return lo, hi


def _content_tokens(row: dict[str, Any]) -> set[str]:
    tokens: set[str] = set()
    for key in ("title", "title_zh", "summary", "summary_zh"):
        tokens.update(title_tokens(str(row.get(key) or "")))
    return tokens


def classify_pair(a: dict[str, Any], b: dict[str, Any]) -> str:
    """Return 'same' (rule), 'ai' (ask model), or 'skip'."""
    if (a.get("id") or "") == (b.get("id") or ""):
        return "skip"
    if not published_close(a.get("published_at"), b.get("published_at")):
        return "skip"
    original_score = title_jaccard(
        str(a.get("title") or ""),
        str(b.get("title") or ""),
    )
    zh_score = title_jaccard(
        str(a.get("title_zh") or ""),
        str(b.get("title_zh") or ""),
    )
    if max(original_score, zh_score) >= TITLE_JACCARD_THRESHOLD:
        return "same"
    left = _content_tokens(a)
    right = _content_tokens(b)
    if not left or not right:
        return "skip"
    if len(left & right) >= WEAK_TOKEN_OVERLAP:
        return "ai"
    return "skip"


def propose_pairs(
    focus: list[dict[str, Any]],
    pool: list[dict[str, Any]],
    existing: set[tuple[str, str]],
) -> tuple[list[dict[str, Any]], list[tuple[dict[str, Any], dict[str, Any]]]]:
    """Split unseen pairs into rule-same rows and AI candidates."""
    by_id = {str(r.get("id") or ""): r for r in pool if r.get("id")}
    for row in focus:
        rid = str(row.get("id") or "")
        if rid:
            by_id[rid] = row
    articles = list(by_id.values())
    rule_rows: list[dict[str, Any]] = []
    ai_pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    seen: set[tuple[str, str]] = set(existing)
    focus_ids = {str(r.get("id") or "") for r in focus if r.get("id")}

    for i, a in enumerate(articles):
        aid = str(a.get("id") or "")
        if not aid:
            continue
        for b in articles[i + 1 :]:
            bid = str(b.get("id") or "")
            if not bid:
                continue
            if aid not in focus_ids and bid not in focus_ids:
                continue
            key = pair_key(aid, bid)
            if key in seen:
                continue
            seen.add(key)
            kind = classify_pair(a, b)
            if kind == "same":
                rule_rows.append(
                    {
                        "article_lo": key[0],
                        "article_hi": key[1],
                        "same": True,
                        "reason": "title-rule",
                    }
                )
            elif kind == "ai":
                ai_pairs.append((a, b))
    return rule_rows, ai_pairs


def score_story_pairs(
    pairs: list[tuple[dict[str, Any], dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Ask the model about candidate pairs. Empty if AI is off."""
    if not pairs or not ai_configured():
        return []
    out: list[dict[str, Any]] = []
    budget = pairs[:STORY_DEDUP_MAX_PAIRS]
    for i in range(0, len(budget), STORY_DEDUP_BATCH):
        chunk = budget[i : i + STORY_DEDUP_BATCH]
        payload = {
            "pairs": [
                {
                    "a": {
                        "id": str(left.get("id") or ""),
                        "source": str(left.get("source") or "")[:80],
                        "title": str(left.get("title") or "")[:200],
                        "title_zh": str(left.get("title_zh") or "")[:200],
                        "summary": clip_text(
                            str(left.get("summary_zh") or left.get("summary") or ""),
                            280,
                        ),
                    },
                    "b": {
                        "id": str(right.get("id") or ""),
                        "source": str(right.get("source") or "")[:80],
                        "title": str(right.get("title") or "")[:200],
                        "title_zh": str(right.get("title_zh") or "")[:200],
                        "summary": clip_text(
                            str(right.get("summary_zh") or right.get("summary") or ""),
                            280,
                        ),
                    },
                }
                for left, right in chunk
            ]
        }
        try:
            data = chat_json(
                STORY_SYSTEM,
                json.dumps(payload, ensure_ascii=False),
                temperature=0.0,
                max_tokens=800,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"story_cluster AI failed: {exc}")
            continue
        results = data.get("results") or []
        if not isinstance(results, list):
            continue
        wanted = {pair_key(str(left.get("id") or ""), str(right.get("id") or "")) for left, right in chunk}
        for row in results:
            if not isinstance(row, dict):
                continue
            key = pair_key(str(row.get("a") or ""), str(row.get("b") or ""))
            if key not in wanted or not key[0] or not key[1]:
                continue
            same = row.get("same")
            if not isinstance(same, bool):
                continue
            out.append(
                {
                    "article_lo": key[0],
                    "article_hi": key[1],
                    "same": same,
                    "reason": str(row.get("reason") or "ai")[:300],
                }
            )
    return out


def _load_articles(sb: Any, ids: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    uniq = [i for i in dict.fromkeys(ids) if i]
    for i in range(0, len(uniq), 100):
        chunk = uniq[i : i + 100]
        try:
            rows = (
                sb.table("articles")
                .select("id, source, title, title_zh, summary, summary_zh, published_at")
                .in_("id", chunk)
                .execute()
                .data
                or []
            )
            out.extend(rows)
        except Exception as exc:  # noqa: BLE001
            print(f"story_cluster load articles failed: {exc}")
    return out


def _load_existing_pairs(sb: Any, ids: list[str]) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    uniq = [i for i in dict.fromkeys(ids) if i]
    if not uniq:
        return keys
    try:
        rows = (
            sb.table("article_story_pairs")
            .select("article_lo, article_hi")
            .or_(f"article_lo.in.({','.join(uniq)}),article_hi.in.({','.join(uniq)})")
            .limit(2000)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        print(f"story_cluster load pairs failed: {exc}")
        return keys
    for row in rows:
        lo, hi = row.get("article_lo"), row.get("article_hi")
        if lo and hi:
            keys.add(pair_key(str(lo), str(hi)))
    return keys


def _load_neighbor_ids(sb: Any, focus_ids: list[str]) -> list[str]:
    """Recent articles that share a reader with the focus set."""
    if not focus_ids:
        return []
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=RECENT_HOURS)).isoformat()
    user_ids: list[str] = []
    try:
        hits = (
            sb.table("article_hits")
            .select("user_id")
            .in_("article_id", focus_ids[:200])
            .limit(500)
            .execute()
            .data
            or []
        )
        user_ids = list({str(h["user_id"]) for h in hits if h.get("user_id")})
    except Exception as exc:  # noqa: BLE001
        print(f"story_cluster load hit users failed: {exc}")
        return []
    if not user_ids:
        return []
    neighbor: list[str] = []
    for i in range(0, len(user_ids), 40):
        uids = user_ids[i : i + 40]
        try:
            rows = (
                sb.table("article_hits")
                .select("article_id")
                .in_("user_id", uids)
                .gte("created_at", cutoff)
                .limit(800)
                .execute()
                .data
                or []
            )
            neighbor.extend(str(r["article_id"]) for r in rows if r.get("article_id"))
        except Exception:  # noqa: BLE001
            continue
    return list(dict.fromkeys(neighbor))


def _upsert_pairs(sb: Any, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    written = 0
    for i in range(0, len(rows), 80):
        chunk = rows[i : i + 80]
        try:
            sb.table("article_story_pairs").upsert(chunk, on_conflict="article_lo,article_hi").execute()
            written += len(chunk)
        except Exception as exc:  # noqa: BLE001
            print(f"story_cluster upsert failed: {exc}")
    return written


def cluster_stories(
    sb: Any,
    focus_ids: list[str],
    *,
    score_fn: Callable[[list[tuple[dict[str, Any], dict[str, Any]]]], list[dict[str, Any]]]
    | None = None,
) -> int:
    """Compare focus articles to nearby ones and cache same-event verdicts."""
    ids = [i for i in dict.fromkeys(focus_ids) if i]
    if not ids:
        return 0
    neighbors = _load_neighbor_ids(sb, ids)
    pool_ids = list(dict.fromkeys([*ids, *neighbors]))
    articles = _load_articles(sb, pool_ids)
    if len(articles) < 2:
        return 0
    focus = [a for a in articles if str(a.get("id") or "") in set(ids)]
    existing = _load_existing_pairs(sb, pool_ids)
    rule_rows, ai_pairs = propose_pairs(focus, articles, existing)
    scorer = score_fn if score_fn is not None else score_story_pairs
    ai_rows = scorer(ai_pairs)
    written = _upsert_pairs(sb, rule_rows + ai_rows)
    if written:
        print(
            f"story_cluster: {len(rule_rows)} rule pairs · "
            f"{len(ai_rows)} AI pairs · wrote {written}"
        )
    return written
