"""Relevance: topic shortlist first, then the model decides.

Keywords only answer "is this worth an AI call?". Place-only hits do not shortlist
a multi-facet intent (a Serbian-PM subscription must not send every flood story).
The model reads the extracted body with the user's intent as a sentence and decides
whether the story is actually about that topic. Rules never write hits on their own
— they are only the fallback when the AI budget is spent or AI is unconfigured.
"""

from __future__ import annotations

import json
import os
from typing import Any

from ai_client import ai_configured, chat_json
from extract import clip_text
from normalize import (
    article_matches_keyword_row,
    clean_exclude_terms,
    recall_score,
)
from sources import is_news_source

# Cost knobs (override via env). Bodies are long, so batches are smaller than they were
# for title-only scoring; verdicts are cached per (keyword, article) so the steady-state
# cost is only the newly published articles.
BATCH_SIZE = int(os.environ.get("RELEVANCE_BATCH_SIZE", "6"))
MAX_SCORE_PER_RUN = int(os.environ.get("RELEVANCE_MAX_PER_RUN", "240"))
BODY_CHARS_FOR_SCORING = int(os.environ.get("RELEVANCE_BODY_CHARS", "1200"))

RELEVANCE_SYSTEM = """你是新闻订阅的相关性审核员。用户用一句中文写下他想追踪的主题，你要判断每篇稿件是不是真的在讲这个主题。宁可漏掉，也不要把无关稿件放进订阅。

判定 relevant=true 需同时满足：
① 稿件的**主要内容**就是用户描述的主题，而不是顺带提及、背景引用、文末链接或事后回顾；
② 命中的词是用户要的那个意思。

以下情况必须判 false：
- 同形异义词：premijer（总理）vs premijera（首映）；izbor（选择）vs izbori（选举）；
  vlada（政府）vs 人名 Vlada/Vladimir；akcija（行动）vs akcija（股票/促销）。
  词义要看上下文，不要只看字面。
- 只是碰巧出现了相同的词：讲的是别的国家、别的人、别的事件。
- 只在文末、引语或相关链接里被提到一句。
- 娱乐、影视、体育、明星八卦、好莱坞——除非用户订阅的本来就是这个主题。
- 邻国本地新闻（克罗地亚、波黑、黑山、北马其顿、阿尔巴尼亚、科索沃、斯洛文尼亚、保加利亚等），
  即便用了同一个词（例如别国的「总理」）。
- 拿不准：一律 false。

注意：要素可以是隐含的。塞尔维亚本国媒体报道本国事务时通常不会重复写国名，
不要因为正文字面没出现「塞尔维亚」就判否。
- 若用户订阅的就是「塞尔维亚」这个国家/地区本身，该国媒体对本国时政、社会、经济的报道判 true；
  娱乐八卦、好莱坞、邻国本地新闻仍判 false。
- 若用户订阅的是更具体的主题（总理、选举、对华投资等），仅出现国名或地名绝对不够。

只依据给出的来源、标题与正文判断，不要臆造。results 必须覆盖用户给出的每一个 id。
只输出 JSON：{"results":[{"id":"文章id","relevant":true/false,"reason":"一句中文理由"}]}"""


def stage1_match(article: dict[str, Any], row: dict[str, Any]) -> bool:
    """Shortlist only: does the article show the keyword's topic, not just a place name?"""
    return recall_score(article, row) > 0


def verdict_should_stand(
    article: dict[str, Any], row: dict[str, Any], *, source: str | None = None
) -> bool:
    """Hard gates that apply even when the model says relevant=true.

    Entertainment / off-country sources never enter a keyword feed. Place-only
    collisions that the shortlist would now reject are also dropped, so a cached
    verdict from the old wide-recall scorer cannot keep junk in the UI.
    """
    src = source if source is not None else (article.get("source") or "")
    if not is_news_source(src):
        return False
    # Excludes stay off this gate: stem overlap can make `premijera` veto `premijer`.
    return recall_score(article, row) > 0


def rule_confident(match: dict[str, Any]) -> bool:
    """Would the strict rule matcher have accepted this on its own?

    Used only as the fallback when the model is unavailable or the scoring budget is
    spent, so a confident hit still reaches the feed instead of being silently dropped.

    Deliberately judged on title and summary alone. Rules read a longer text as more
    chances to hit a wrong sense, not as more evidence — over a full body a Serbian-PM
    keyword starts accepting stories about a film premiere. Only the model gains from
    the body, so the rule fallback stays on the short, dense text.
    """
    article = {
        "title": match.get("title") or "",
        "summary": match.get("summary") or "",
        "source": match.get("source") or "",
    }
    row = {
        "phrase": match.get("keyword_phrase") or "",
        "match_mode": match.get("match_mode") or "",
        "match_groups": match.get("match_groups"),
        "search_terms": match.get("search_terms"),
        "exclude_terms": match.get("exclude_terms"),
    }
    if not verdict_should_stand(article, row, source=article["source"]):
        return False
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


def item_id(it: dict[str, Any]) -> str:
    """Matches from crawl.py use `article_id`; keep `id` as a fallback."""
    return str(it.get("article_id") or it.get("id") or "")


def scoring_item(it: dict[str, Any]) -> dict[str, str]:
    return {
        "id": item_id(it),
        "source": (it.get("source") or "")[:80],
        "title": (it.get("title") or "")[:200],
        "text": clip_text(
            (it.get("body") or "").strip() or (it.get("summary") or ""),
            BODY_CHARS_FOR_SCORING,
        ),
    }


def score_batch(
    phrase: str, items: list[dict[str, str]], *, avoid: list[str] | None = None
) -> dict[str, tuple[bool, str]]:
    """items: [{id, title, summary, body, source}] -> id -> (relevant, reason)."""
    if not items:
        return {}
    if not ai_configured():
        return {}

    payload = {
        "intent": phrase,
        "wrong_sense_terms": avoid or [],
        "articles": [scoring_item(it) for it in items],
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
    search_terms, exclude_terms, article_id, title, summary, body, source, recall}
    """
    if not matches:
        return []

    cache = load_relevance_cache(
        sb, [(m["keyword_id"], m["article_id"]) for m in matches]
    )

    pending_by_kw: dict[str, list[dict[str, Any]]] = {}
    decided: dict[tuple[str, str], bool] = {}
    stale_cache: list[dict[str, Any]] = []

    for m in matches:
        key = (m["keyword_id"], m["article_id"])
        if not verdict_should_stand(m, _row_from_match(m), source=m.get("source") or ""):
            decided[key] = False
            if cache.get(key) is True:
                stale_cache.append(
                    {
                        "keyword_id": m["keyword_id"],
                        "article_id": m["article_id"],
                        "relevant": False,
                        "reason": "shortlist/source gate",
                    }
                )
            continue
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
    new_rows: list[dict[str, Any]] = list(stale_cache)

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
                if rel and not verdict_should_stand(
                    m, _row_from_match(m), source=m.get("source") or ""
                ):
                    rel = False
                    reason = (reason + " / gated").strip()[:300]
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


def _row_from_match(match: dict[str, Any]) -> dict[str, Any]:
    return {
        "phrase": match.get("keyword_phrase") or match.get("phrase") or "",
        "match_mode": match.get("match_mode") or "",
        "match_groups": match.get("match_groups"),
        "search_terms": match.get("search_terms"),
        "exclude_terms": match.get("exclude_terms"),
    }


def retract_stale_feed(
    sb: Any, user_keywords: dict[str, list[dict[str, Any]]]
) -> tuple[int, int]:
    """Drop cached positives and hits that the new gates would never accept.

    Hits are cumulative (they are not rebuilt each crawl), so entertainment /
    off-country / place-only false positives would otherwise stay in the UI forever.
    """
    keyword_by_id: dict[str, dict[str, Any]] = {}
    for uid, rows in user_keywords.items():
        for row in rows:
            kid = row.get("id")
            if not kid:
                continue
            keyword_by_id[kid] = row
    kids = list(keyword_by_id)
    if not kids:
        return 0, 0

    flipped = 0
    new_rows: list[dict[str, Any]] = []
    # Page positives; PostgREST max-rows is typically 1000.
    page_size = 200
    offset = 0
    positives: list[dict[str, Any]] = []
    while True:
        try:
            chunk = (
                sb.table("article_keyword_relevance")
                .select("keyword_id, article_id, relevant")
                .in_("keyword_id", kids)
                .eq("relevant", True)
                .range(offset, offset + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception as exc:  # noqa: BLE001
            print(f"retract: relevance scan failed: {exc}")
            break
        positives.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
        if offset >= 5000:
            break

    aids = list({r["article_id"] for r in positives})
    articles: dict[str, dict[str, Any]] = {}
    for i in range(0, len(aids), 100):
        chunk_ids = aids[i : i + 100]
        try:
            rows = (
                sb.table("articles")
                .select("id, source, title, summary, body")
                .in_("id", chunk_ids)
                .execute()
                .data
                or []
            )
        except Exception:
            rows = (
                sb.table("articles")
                .select("id, source, title, summary")
                .in_("id", chunk_ids)
                .execute()
                .data
                or []
            )
        for a in rows:
            articles[a["id"]] = a

    still_true: set[tuple[str, str]] = set()
    for rel in positives:
        kid = rel["keyword_id"]
        aid = rel["article_id"]
        row = keyword_by_id.get(kid)
        article = articles.get(aid)
        if not row or not article:
            continue
        if verdict_should_stand(article, row, source=article.get("source") or ""):
            still_true.add((kid, aid))
            continue
        new_rows.append(
            {
                "keyword_id": kid,
                "article_id": aid,
                "relevant": False,
                "reason": "retracted: off-source or topic-less shortlist",
            }
        )
        flipped += 1

    save_relevance(sb, new_rows)

    # Drop user hits that no remaining keyword still accepts.
    dropped_hits = 0
    users = list(user_keywords)
    for uid in users:
        hit_rows: list[dict[str, Any]] = []
        hit_offset = 0
        while True:
            try:
                chunk = (
                    sb.table("article_hits")
                    .select("article_id")
                    .eq("user_id", uid)
                    .range(hit_offset, hit_offset + page_size - 1)
                    .execute()
                    .data
                    or []
                )
            except Exception as exc:  # noqa: BLE001
                print(f"retract: hit scan failed for {uid}: {exc}")
                hit_rows = []
                break
            hit_rows.extend(chunk)
            if len(chunk) < page_size:
                break
            hit_offset += page_size
            if hit_offset >= 5000:
                break
        hit_ids = list({r["article_id"] for r in hit_rows})
        missing = [aid for aid in hit_ids if aid not in articles]
        for i in range(0, len(missing), 100):
            chunk_ids = missing[i : i + 100]
            try:
                rows = (
                    sb.table("articles")
                    .select("id, source, title, summary, body")
                    .in_("id", chunk_ids)
                    .execute()
                    .data
                    or []
                )
            except Exception:
                rows = (
                    sb.table("articles")
                    .select("id, source, title, summary")
                    .in_("id", chunk_ids)
                    .execute()
                    .data
                    or []
                )
            for a in rows:
                articles[a["id"]] = a

        drop: list[str] = []
        krows = user_keywords.get(uid) or []
        for aid in hit_ids:
            article = articles.get(aid)
            if not article:
                drop.append(aid)
                continue
            keep = False
            for krow in krows:
                kid = krow.get("id")
                if not kid:
                    continue
                if (kid, aid) in still_true:
                    keep = True
                    break
                # Uncached historical hit: only keep if the strict rule still accepts
                # it on a news source (do not keep mere shortlist leftovers).
                head = {
                    "title": article.get("title") or "",
                    "summary": article.get("summary") or "",
                }
                if verdict_should_stand(
                    article, krow, source=article.get("source") or ""
                ) and article_matches_keyword_row(head, krow):
                    keep = True
                    break
            if not keep:
                drop.append(aid)

        for i in range(0, len(drop), 100):
            chunk = drop[i : i + 100]
            try:
                sb.table("article_hits").delete().eq("user_id", uid).in_(
                    "article_id", chunk
                ).execute()
                dropped_hits += len(chunk)
            except Exception as exc:  # noqa: BLE001
                print(f"retract: hit delete failed: {exc}")

    print(f"Retract: flipped_relevance={flipped} dropped_hits={dropped_hits}")
    return flipped, dropped_hits
