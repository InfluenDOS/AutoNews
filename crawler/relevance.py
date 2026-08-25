"""Relevance: the model reads the article body and decides, keywords only shortlist.

Keyword rules cannot settle whether a story is about the subscribed topic. They see a
title and a truncated RSS summary, and the user's intent reaches them already compiled
into a boolean term expression, which is lossy in both directions: a long phrase either
fans out into single words that match everything, or into an AND that matches nothing.

So keywords are demoted to what they are good at — cheaply shortlisting articles worth
looking at — and the decision moves to the model, which reads the extracted body and
gets the intent as the sentence the user actually wrote.
"""

from __future__ import annotations

import json
import os
from typing import Any

from ai_client import ai_configured, chat_json
from extract import clip_text
from normalize import article_matches_keyword_row, clean_exclude_terms, recall_score

# Cost knobs (override via env). Bodies are long, so batches are smaller than they were
# for title-only scoring; verdicts are cached per (keyword, article) so the steady-state
# cost is only the newly published articles.
BATCH_SIZE = int(os.environ.get("RELEVANCE_BATCH_SIZE", "6"))
MAX_SCORE_PER_RUN = int(os.environ.get("RELEVANCE_MAX_PER_RUN", "240"))
BODY_CHARS_FOR_SCORING = int(os.environ.get("RELEVANCE_BODY_CHARS", "1200"))

RELEVANCE_SYSTEM = """你是新闻订阅的相关性审核员。用户用一句中文写下他想追踪的主题，你要判断每篇稿件是不是真的在讲这个主题。

判定 relevant=true 需同时满足：
① 稿件的主要内容就是用户描述的主题，而不是顺带提及、背景引用或事后回顾；
② 命中的词是用户要的那个意思。

以下情况判 false：
- 同形异义词：premijer（总理）vs premijera（首映）；izbor（选择）vs izbori（选举）；
  vlada（政府）vs 人名 Vlada/Vladimir；akcija（行动）vs akcija（股票/促销）。
  词义要看上下文，不要只看字面。
- 主题另有所指：讲的是别的国家、别的人、别的事件，只是碰巧出现了相同的词。
- 只在文末、引语或相关链接里被提到一句。

注意：要素可以是隐含的。本地媒体报道本国事务时通常不会重复写国名，
不要因为正文字面没出现「塞尔维亚」就判否；但如果正文明确是在讲另一个国家，则判否。

只依据给出的标题与正文判断，不要臆造。results 必须覆盖用户给出的每一个 id。
只输出 JSON：{"results":[{"id":"文章id","relevant":true/false,"reason":"一句中文理由"}]}"""


def stage1_match(article: dict[str, Any], row: dict[str, Any]) -> bool:
    """Shortlist only: does any term of this keyword appear in the article at all?"""
    return recall_score(article, row) > 0


def rule_confident(match: dict[str, Any]) -> bool:
    """Would the old strict rule matcher have accepted this on its own?

    Used only as the fallback when the model is unavailable or the scoring budget is
    spent, so a confident hit still reaches the feed instead of being silently dropped.
    """
    article = {
        "title": match.get("title") or "",
        "summary": match.get("summary") or "",
        "body": match.get("body") or "",
    }
    row = {
        "phrase": match.get("keyword_phrase") or "",
        "match_mode": match.get("match_mode") or "",
        "match_groups": match.get("match_groups"),
        "search_terms": match.get("search_terms"),
        "exclude_terms": match.get("exclude_terms"),
    }
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
    # `reason` needs migration 014; retry without it so an un-migrated database still works.
    last: Exception | None = None
    for payload in (rows, [{k: v for k, v in r.items() if k != "reason"} for r in rows]):
        try:
            for i in range(0, len(payload), 100):
                sb.table("article_keyword_relevance").upsert(
                    payload[i : i + 100], on_conflict="keyword_id,article_id"
                ).execute()
            return
        except Exception as exc:  # noqa: BLE001
            last = exc
    print(f"relevance upsert failed: {last}")


def score_batch(
    phrase: str, items: list[dict[str, str]], *, avoid: list[str] | None = None
) -> dict[str, tuple[bool, str]]:
    """items: [{id, title, summary, body}] -> id -> (relevant, reason)."""
    if not items:
        return {}
    if not ai_configured():
        return {}

    payload = {
        "intent": phrase,
        "wrong_sense_terms": avoid or [],
        "articles": [
            {
                "id": it["id"],
                "title": (it.get("title") or "")[:200],
                "text": clip_text(
                    (it.get("body") or "").strip() or (it.get("summary") or ""),
                    BODY_CHARS_FOR_SCORING,
                ),
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
    out: dict[str, tuple[bool, str]] = {}
    if isinstance(results, list):
        for r in results:
            if not isinstance(r, dict):
                continue
            rid = str(r.get("id") or "")
            if rid:
                out[rid] = (bool(r.get("relevant")), str(r.get("reason") or "")[:300])
    return out


def filter_matches_with_relevance(
    sb: Any,
    *,
    matches: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Decide every shortlisted (keyword, article) pair and return article_hits rows.

    matches item: {user_id, keyword_id, keyword_phrase, match_mode, match_groups,
    search_terms, exclude_terms, article_id, title, summary, body, recall}
    """
    if not matches:
        return []

    cache = load_relevance_cache(
        sb, [(m["keyword_id"], m["article_id"]) for m in matches]
    )

    pending_by_kw: dict[str, list[dict[str, Any]]] = {}
    decided: dict[tuple[str, str], bool] = {}

    for m in matches:
        key = (m["keyword_id"], m["article_id"])
        if key in cache:
            decided[key] = cache[key]
        else:
            pending_by_kw.setdefault(m["keyword_id"], []).append(m)

    # Spend the budget on the strongest candidates first, both across and within keywords.
    order = sorted(
        pending_by_kw.items(),
        key=lambda kv: -max((m.get("recall") or 0) for m in kv[1]),
    )

    scored = 0
    fell_back = 0
    new_rows: list[dict[str, Any]] = []

    for kid, items in order:
        by_aid = {m["article_id"]: m for m in items}
        unique = sorted(by_aid.values(), key=lambda m: -(m.get("recall") or 0))

        if scored >= MAX_SCORE_PER_RUN or not ai_configured():
            for m in unique:
                decided[(kid, m["article_id"])] = rule_confident(m)
            fell_back += len(unique)
            continue

        phrase = items[0]["keyword_phrase"]
        avoid = clean_exclude_terms(items[0].get("exclude_terms"))

        for i in range(0, len(unique), BATCH_SIZE):
            if scored >= MAX_SCORE_PER_RUN:
                for m in unique[i:]:
                    decided[(kid, m["article_id"])] = rule_confident(m)
                fell_back += len(unique) - i
                break
            chunk = unique[i : i + BATCH_SIZE][: MAX_SCORE_PER_RUN - scored]
            try:
                result = score_batch(phrase, chunk, avoid=avoid)
            except Exception as exc:  # noqa: BLE001
                print(f"relevance batch failed for {kid}: {exc}")
                result = {}
            for m in chunk:
                verdict = result.get(m["article_id"])
                if verdict is None:
                    # No verdict for this id: keep the rule decision rather than guess.
                    decided[(kid, m["article_id"])] = rule_confident(m)
                    fell_back += 1
                    continue
                rel, reason = verdict
                decided[(kid, m["article_id"])] = rel
                new_rows.append(
                    {
                        "keyword_id": kid,
                        "article_id": m["article_id"],
                        "relevant": rel,
                        "reason": reason,
                    }
                )
            scored += len(chunk)

    save_relevance(sb, new_rows)
    kept = sum(1 for v in decided.values() if v)
    print(
        f"Relevance: pairs={len(matches)} cached={len(cache)} scored={scored} "
        f"rule_fallback={fell_back} kept={kept}"
    )

    hit_keys: set[tuple[str, str]] = set()
    hits: list[dict[str, str]] = []
    for m in matches:
        if not decided.get((m["keyword_id"], m["article_id"])):
            continue
        key = (m["user_id"], m["article_id"])
        if key in hit_keys:
            continue
        hit_keys.add(key)
        hits.append({"user_id": m["user_id"], "article_id": m["article_id"]})
    return hits
