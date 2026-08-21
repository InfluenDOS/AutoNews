"""Stage-2 relevance filter: batch LLM checks with caching to control cost."""

from __future__ import annotations

import json
import os
from typing import Any

from ai_client import ai_configured, chat_json
from normalize import clean_match_groups

# Cost knobs (override via env)
BATCH_SIZE = int(os.environ.get("RELEVANCE_BATCH_SIZE", "12"))
MAX_SCORE_PER_RUN = int(os.environ.get("RELEVANCE_MAX_PER_RUN", "80"))

RELEVANCE_SYSTEM = """你是新闻相关性审核员。根据用户的订阅意图，判断候选稿是否真正相关。
只输出 JSON：{"results":[{"id":"文章id","relevant":true/false}]}

规则：
1. relevant=true：稿件主题确实在回答/覆盖用户意图的核心（多要素都要沾边）。
2. relevant=false：仅有其中一个要素、擦边、同词异义、或完全另一话题。
3. 只依据给定的标题和摘要，不要臆造。
4. results 必须覆盖用户给出的每一篇 id。"""


def needs_stage2(row: dict[str, Any]) -> bool:
    """Strict / multi-facet keywords get LLM confirmation."""
    mode = (row.get("match_mode") or "").strip()
    groups = clean_match_groups(row.get("match_groups"))
    if mode == "strict" and len(groups) >= 2:
        return True
    if len(groups) >= 2:
        return True
    return False


def stage1_match(article: dict[str, Any], row: dict[str, Any]) -> bool:
    """Broad recall for stage-2 keywords; otherwise normal keyword row match."""
    from normalize import (
        article_matches_keyword_row,
        haystack_for_article,
        phrase_hits,
    )

    groups = clean_match_groups(row.get("match_groups"))
    if needs_stage2(row) and groups:
        hay, norm = haystack_for_article(article)
        # At least half of facet groups (wider than full AND, cheaper than full OR)
        hits = 0
        for g in groups:
            if any(phrase_hits(hay, norm, alt) for alt in g):
                hits += 1
        need = max(1, (len(groups) + 1) // 2)
        return hits >= need

    return article_matches_keyword_row(article, row)


def load_relevance_cache(
    sb: Any, pairs: list[tuple[str, str]]
) -> dict[tuple[str, str], bool]:
    """pairs: (keyword_id, article_id) -> relevant."""
    if not pairs:
        return {}
    kids = list({p[0] for p in pairs})
    aids = list({p[1] for p in pairs})
    out: dict[tuple[str, str], bool] = {}
    # chunk article ids
    for i in range(0, len(aids), 100):
        chunk = aids[i : i + 100]
        try:
            rows = (
                sb.table("article_keyword_relevance")
                .select("keyword_id, article_id, relevant")
                .in_("keyword_id", kids)
                .in_("article_id", chunk)
                .execute()
                .data
                or []
            )
        except Exception as exc:  # noqa: BLE001
            print(f"relevance cache unavailable: {exc}")
            return {}
        for r in rows:
            out[(r["keyword_id"], r["article_id"])] = bool(r["relevant"])
    return out


def save_relevance(sb: Any, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    try:
        for i in range(0, len(rows), 100):
            sb.table("article_keyword_relevance").upsert(
                rows[i : i + 100], on_conflict="keyword_id,article_id"
            ).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"relevance upsert failed: {exc}")


def score_batch(
    phrase: str, items: list[dict[str, str]]
) -> dict[str, bool]:
    """items: [{id, title, summary}] -> id -> relevant."""
    if not items:
        return {}
    if not ai_configured():
        # Fail open for ops without AI: keep stage-1 hits
        return {it["id"]: True for it in items}

    payload = {
        "intent": phrase,
        "articles": [
            {
                "id": it["id"],
                "title": (it.get("title") or "")[:200],
                "summary": (it.get("summary") or "")[:280],
            }
            for it in items
        ],
    }
    data = chat_json(
        RELEVANCE_SYSTEM,
        json.dumps(payload, ensure_ascii=False),
        temperature=0.0,
    )
    results = data.get("results") or []
    out: dict[str, bool] = {}
    if isinstance(results, list):
        for r in results:
            if not isinstance(r, dict):
                continue
            rid = str(r.get("id") or "")
            if not rid:
                continue
            out[rid] = bool(r.get("relevant"))
    # missing ids → reject (cost control: don't keep uncertain)
    for it in items:
        out.setdefault(it["id"], False)
    return out


def filter_matches_with_relevance(
    sb: Any,
    *,
    matches: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Apply stage-2 to stage-1 matches.

    matches item: {
      user_id, keyword_id, keyword_phrase, match_mode, match_groups,
      article_id, title, summary
    }
    Returns article_hits rows: {user_id, article_id} (deduped).
    """
    if not matches:
        return []

    stage2 = [m for m in matches if needs_stage2(m)]
    stage1_only = [m for m in matches if not needs_stage2(m)]

    pairs = [(m["keyword_id"], m["article_id"]) for m in stage2]
    cache = load_relevance_cache(sb, pairs)

    pending_by_kw: dict[str, list[dict[str, Any]]] = {}
    decided: dict[tuple[str, str], bool] = {}

    for m in stage2:
        key = (m["keyword_id"], m["article_id"])
        if key in cache:
            decided[key] = cache[key]
        else:
            pending_by_kw.setdefault(m["keyword_id"], []).append(m)

    scored = 0
    new_rows: list[dict[str, Any]] = []
    for kid, items in pending_by_kw.items():
        if scored >= MAX_SCORE_PER_RUN:
            # Budget exhausted: drop unscored stage-2 (don't pollute feed)
            for m in items:
                decided[(m["keyword_id"], m["article_id"])] = False
            continue
        phrase = items[0]["keyword_phrase"]
        # unique articles
        by_aid = {m["article_id"]: m for m in items}
        unique = list(by_aid.values())
        for i in range(0, len(unique), BATCH_SIZE):
            if scored >= MAX_SCORE_PER_RUN:
                for m in unique[i:]:
                    decided[(kid, m["article_id"])] = False
                break
            chunk = unique[i : i + BATCH_SIZE]
            remain = MAX_SCORE_PER_RUN - scored
            chunk = chunk[:remain]
            batch_in = [
                {
                    "id": m["article_id"],
                    "title": m.get("title") or "",
                    "summary": m.get("summary") or "",
                }
                for m in chunk
            ]
            try:
                result = score_batch(phrase, batch_in)
            except Exception as exc:  # noqa: BLE001
                print(f"relevance batch failed for {kid}: {exc}")
                result = {m["article_id"]: True for m in chunk}  # fail open once
            for m in chunk:
                rel = bool(result.get(m["article_id"], False))
                decided[(kid, m["article_id"])] = rel
                new_rows.append(
                    {
                        "keyword_id": kid,
                        "article_id": m["article_id"],
                        "relevant": rel,
                    }
                )
            scored += len(chunk)

    save_relevance(sb, new_rows)
    print(f"Relevance: cached={len(cache)} newly_scored={scored} stage2={len(stage2)} stage1_only={len(stage1_only)}")

    hit_keys: set[tuple[str, str]] = set()
    hits: list[dict[str, str]] = []

    def add_hit(uid: str, aid: str) -> None:
        k = (uid, aid)
        if k in hit_keys:
            return
        hit_keys.add(k)
        hits.append({"user_id": uid, "article_id": aid})

    for m in stage1_only:
        add_hit(m["user_id"], m["article_id"])

    for m in stage2:
        key = (m["keyword_id"], m["article_id"])
        if decided.get(key):
            add_hit(m["user_id"], m["article_id"])

    return hits
