"""Re-judge feed hits that entered without an AI verdict.

When the model is unavailable (spent budget, refused account) relevance falls back to
the rule matcher, which writes article_hits but stores no verdict. Keyword feeds read
verdicts and hide those hits; the 全部 feed shows them. Between 2026-10-01 and
2026-10-13 every hit came in that way.

This asks the model about each unjudged (keyword, article) pair behind those hits.
A hit is removed only when every shortlisted keyword of that user has a verdict and
all of them say not relevant; unknown verdicts and starred articles are kept.

    python rejudge_hits.py --since 2026-10-01            # report only, writes nothing
    python rejudge_hits.py --since 2026-10-01 --apply    # save verdicts, drop rejected hits

--apply writes the removed hits to removed_hits.json so they can be restored.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from ai_client import AIUnavailable, ai_configured
from crawl import get_supabase, load_user_keywords
from normalize import clean_exclude_terms, recall_score
from relevance import BATCH_SIZE, load_relevance_cache, save_relevance, score_batch, verdict_should_stand
from sources import register_news_names
from user_sources import collect_crawl_sources, load_source_bundles


def _page(query_fn, page_size: int = 1000) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset = 0
    while True:
        rows = query_fn().range(offset, offset + page_size - 1).execute().data or []
        out.extend(rows)
        if len(rows) < page_size:
            return out
        offset += page_size


def _load_articles(sb: Any, ids: list[str]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(ids), 100):
        rows = (
            sb.table("articles")
            .select("id, source, title, summary, body")
            .in_("id", ids[i : i + 100])
            .execute()
            .data
            or []
        )
        out.update({r["id"]: r for r in rows})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True, help="hits created at or after this ISO date")
    ap.add_argument("--apply", action="store_true", help="save verdicts and remove rejected hits")
    args = ap.parse_args()
    if not ai_configured():
        sys.exit("AI_API_KEY not set")

    sb = get_supabase()
    user_keywords = load_user_keywords(sb)
    _, extra_names, _ = collect_crawl_sources(load_source_bundles(sb))
    register_news_names(extra_names)

    hits = _page(
        lambda: sb.table("article_hits")
        .select("user_id, article_id, created_at")
        .gte("created_at", args.since)
        .order("created_at")
        .order("article_id")
        .order("user_id")
    )
    starred = {
        (r["user_id"], r["article_id"])
        for r in _page(lambda: sb.table("stars").select("user_id, article_id").order("id"))
    }
    articles = _load_articles(sb, sorted({h["article_id"] for h in hits}))
    print(f"Hits since {args.since}: {len(hits)} · articles {len(articles)} · users {len(user_keywords)}")

    # The same shortlist the crawl uses: a keyword only judges articles it recalls.
    pairs_by_hit: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]] = {}
    for h in hits:
        art = articles.get(h["article_id"])
        if not art:
            continue
        rows = [
            (row["id"], row)
            for row in user_keywords.get(h["user_id"], [])
            if row.get("id") and recall_score(art, row) > 0
        ]
        pairs_by_hit[(h["user_id"], h["article_id"])] = rows

    cache = load_relevance_cache(
        sb, [(kid, aid) for (_, aid), rows in pairs_by_hit.items() for kid, _ in rows]
    )

    pending: dict[str, dict[str, Any]] = {}  # keyword id -> {"row": row, "articles": {aid: art}}
    for (_, aid), rows in pairs_by_hit.items():
        for kid, row in rows:
            if (kid, aid) not in cache:
                pending.setdefault(kid, {"row": row, "articles": {}})["articles"][aid] = articles[aid]
    n_pending = sum(len(p["articles"]) for p in pending.values())
    print(f"Pairs already judged: {len(cache)} · to ask the model: {n_pending}")

    verdicts: dict[tuple[str, str], bool] = dict(cache)
    new_rows: list[dict[str, Any]] = []
    stopped = False
    for kid, p in pending.items():
        row = p["row"]
        items = [{"article_id": aid, **a} for aid, a in p["articles"].items()]
        for i in range(0, len(items), BATCH_SIZE):
            chunk = items[i : i + BATCH_SIZE]
            try:
                result = score_batch(
                    row.get("phrase") or "", chunk, avoid=clean_exclude_terms(row.get("exclude_terms"))
                )
            except AIUnavailable as exc:
                print(f"AI unavailable, stopping: {exc}", file=sys.stderr)
                stopped = True
                break
            except Exception as exc:  # noqa: BLE001
                print(f"batch failed for {kid}: {exc}", file=sys.stderr)
                continue
            for it in chunk:
                aid = it["article_id"]
                if aid not in result:
                    continue
                rel, reason = result[aid]
                # Same hard gate the crawl applies on top of the model.
                if rel and not verdict_should_stand(it, row, source=it.get("source") or ""):
                    rel, reason = False, (reason + " / gated").strip()[:300]
                verdicts[(kid, aid)] = rel
                new_rows.append({"keyword_id": kid, "article_id": aid, "relevant": rel, "reason": reason})
        if stopped:
            break

    keep_rel = drop = keep_unknown = keep_star = no_shortlist = 0
    removed: list[dict[str, Any]] = []
    for h in hits:
        key = (h["user_id"], h["article_id"])
        rows = pairs_by_hit.get(key)
        if not rows:
            no_shortlist += 1  # keyword edited/removed since; the daily retract owns these
            continue
        vs = [verdicts.get((kid, h["article_id"])) for kid, _ in rows]
        if any(v is True for v in vs):
            keep_rel += 1
        elif any(v is None for v in vs):
            keep_unknown += 1
        elif key in starred:
            keep_star += 1
        else:
            drop += 1
            removed.append(h)

    print(
        f"Verdicts: relevant kept {keep_rel} · rejected {drop} · "
        f"kept unknown {keep_unknown} · kept starred {keep_star} · no shortlist {no_shortlist}"
    )
    for h in removed[:25]:
        print(f"  drop: {(articles[h['article_id']].get('title') or '')[:100]}")

    if not args.apply:
        print("Report only (no --apply): nothing written.")
        return

    save_relevance(sb, new_rows)
    with open("removed_hits.json", "w", encoding="utf-8") as f:
        json.dump(removed, f, ensure_ascii=False, indent=1)
    by_user: dict[str, list[str]] = {}
    for h in removed:
        by_user.setdefault(h["user_id"], []).append(h["article_id"])
    deleted = 0
    for uid, aids in by_user.items():
        for i in range(0, len(aids), 100):
            sb.table("article_hits").delete().eq("user_id", uid).in_("article_id", aids[i : i + 100]).execute()
            deleted += len(aids[i : i + 100])
    print(f"Applied: saved {len(new_rows)} verdicts · removed {deleted} hits (backup removed_hits.json)")


if __name__ == "__main__":
    main()
