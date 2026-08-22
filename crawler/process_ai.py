"""Expand Chinese keyword phrases and rewrite foreign-language articles into Chinese."""

from __future__ import annotations

import json
import sys
from typing import Any

from ai_client import ai_configured, chat_json
from crawl import get_supabase
from jobs import job_title, mark_jobs, phrase_label
from normalize import (
    clean_exclude_terms,
    clean_match_groups,
    expand_match_terms,
    normalize_for_match,
    suggest_match_mode,
)


# Bumped whenever EXPAND_SYSTEM changes in a way that should re-expand stored keywords.
EXPAND_VERSION = 2

EXPAND_SYSTEM = """你是巴尔干多语种新闻检索助手。用户用中文描述订阅意图，你输出用于匹配当地媒体原文的检索结构。
只输出 JSON：
{
  "match_mode": "loose" 或 "strict",
  "match_groups": [["variantA","variantB"], ["variantC"]],
  "search_terms": ["phrase1","phrase2"],
  "exclude_terms": ["wrongSense"],
  "ai_note": "一句中文说明"
}

硬性规则：
1. 一律用目标媒体原文（塞尔维亚语拉丁字母、克罗地亚语、波斯尼亚语、英语），严禁中文。
2. 每个词都要带常见变格形式：Srbija/Srbiji/Srbijom、kineski/kineskih/kineska、izbori/izbore/izborima。
3. 消歧优先。若某词在当地语言里多义、或与人名/常用词同形，不要单独给出：
   要么写成消歧的多词短语（用 vlada Srbije 而不是裸 vlada，因为 vlad- 会撞 Vladimir），
   要么把错误义项放进 exclude_terms（意图是 premijer 总理时，exclude_terms 放 premijera 首映）。
4. 短话题（如「武契奇」「选举」）→ match_mode=loose；search_terms 给 6～10 条，优先多词短语；
   只有用户确实想订阅整个大领域（如「塞尔维亚新闻」）时才给裸单词。
5. 多要素长意图（如「中国籍非法移民在塞尔维亚」）→ match_mode=strict；
   match_groups 给 2～4 组核心要素（组内是同一要素的多语言/多变格写法，组间要求「基本都要沾边」）。
   示例：[["kineski državljani","kineskih državljana","Chinese nationals"],
         ["ilegalni migranti","ilegalne migracije","illegal migrants"],
         ["Srbija","Srbiji","Serbia"]]。
6. 只拆真正的核心要素。当地媒体不会逐字重复的语境（本国国名、显而易见的地点）最多占一组；
   程序性细节（被拘留、召开会议、表示关切）不要单独成组，融进要素短语里。
7. 组数宁少勿多：2～3 组能表达就不要凑到 4 组。
8. ai_note 用一句中文说明你如何理解该意图；不要 Markdown。"""


TRANSLATE_SYSTEM = """你是新华社/财新风格的国际新闻改写编辑。输入可能是外语（含塞尔维亚语拉丁/西里尔、英语等）的标题+摘要。
你的任务不是逐词翻译，而是先理解事实，再用通顺的简体中文写成一篇可独立阅读的短讯。

只输出 JSON：
{
  "title_zh": "中文标题",
  "lead_zh": "一句话导语",
  "summary_zh": "列表用短摘要（40～80字）",
  "body_zh": "详情正文，2～4个自然段，用\\n\\n分段"
}

硬性规则：
1. 标题：像国内新闻客户端，15～28字为宜；去掉原文全大写、感叹号堆砌、标题党腔。
2. 导语：一句话交代「谁、做了什么、结果/影响」。
3. 正文：完整可读，包含背景与关键细节；语气冷静客观，像正式报道，不要口语、不要网感梗。
4. 人名地名用通行中文；若无通行译名，用「中文（原文）」。已知对照可参考：Vučić/Вучић=武契奇，Beograd=贝尔格莱德，Srbija=塞尔维亚，Kosovo=科索沃，EU=欧盟，NATO=北约。
5. 严禁机翻腔：不要「进行了…的表示」「关于…一事」「据报道称称」；不要把外语句式硬搬进中文。
6. 只使用输入里有的信息，可改写重组，不可编造数字、引语、原因。
7. 不要 Markdown，不要解释。"""


def _ensure_intent_locations(phrase: str, groups: list[list[str]]) -> list[list[str]]:
    """If the Chinese intent names a place, keep a foreign-language location group."""
    flat = " ".join(alt for g in groups for alt in g).casefold()
    out = list(groups)
    if any(x in phrase for x in ("塞尔维亚", "塞国")) or "serbia" in phrase.casefold():
        if not any(x in flat for x in ("srbij", "serbia")):
            out.append(["Srbija", "Srbiji", "Serbia", "Serbian"])
    if "巴尔干" in phrase and not any(x in flat for x in ("balkan", "balkan")):
        out.append(["Balkan", "Balkanu", "Western Balkans"])
    return out[:6]


def _drop_chinese(items: Any) -> list[str]:
    """Keep only foreign-language strings; a bad model response can leak Chinese back."""
    if not isinstance(items, list):
        return []
    return [
        str(t).strip()
        for t in items
        if str(t).strip() and not any("\u4e00" <= ch <= "\u9fff" for ch in str(t))
    ]


def expand_keyword_phrase(phrase: str) -> dict[str, Any]:
    suggested = suggest_match_mode(phrase)
    data = chat_json(
        EXPAND_SYSTEM,
        (
            f"用户输入：{phrase}\n"
            f"（建议 match_mode={suggested}；检索词必须是塞/英等原文，不要中文；"
            f"若意图含地点，match_groups 必须单独有一组地点变体；"
            f"多义词请消歧或写进 exclude_terms）"
        ),
    )

    groups = clean_match_groups(data.get("match_groups"))
    groups = [_drop_chinese(g) for g in groups]
    groups = [g for g in groups if g]
    groups = _ensure_intent_locations(phrase, groups)

    terms_raw = _drop_chinese(data.get("search_terms"))
    terms = expand_match_terms(phrase, terms_raw)
    excludes = clean_exclude_terms(_drop_chinese(data.get("exclude_terms")))

    ai_mode = str(data.get("match_mode") or "").strip()
    want_strict = (ai_mode == "strict" or suggested == "strict") and len(groups) >= 2
    if want_strict:
        mode = "strict"
        flat: list[str] = []
        seen: set[str] = set()
        for g in groups:
            for alt in g:
                key = normalize_for_match(alt)
                if key and key not in seen:
                    seen.add(key)
                    flat.append(alt)
        terms = flat[:16] or terms
    else:
        mode = "loose"
        groups = []
        if not terms:
            terms = terms_raw[:8] or [phrase]

    note = str(data.get("ai_note") or "").strip()[:300]
    return {
        "match_mode": mode,
        "match_groups": groups,
        "search_terms": terms[:12],
        "exclude_terms": excludes,
        "ai_note": note,
    }


def _keyword_needs_expand(row: dict[str, Any], force: bool) -> bool:
    if force:
        return True
    terms = row.get("search_terms") or []
    groups = row.get("match_groups") or []
    phrase = (row.get("phrase") or "").strip()
    if not terms:
        return True
    # Terms produced by an older prompt lack disambiguation and sense guards. Only
    # checked when the column exists, so an un-migrated DB is not re-expanded forever.
    if "expand_version" in row and int(row.get("expand_version") or 0) < EXPAND_VERSION:
        return True
    # Re-expand long intents that never got structured groups
    if suggest_match_mode(phrase) == "strict":
        cleaned = clean_match_groups(groups)
        if len(cleaned) < 2:
            return True
    return False


def process_keywords(limit: int = 30, force: bool = False) -> int:
    sb = get_supabase()
    selects = (
        "id, phrase, search_terms, match_groups, match_mode, exclude_terms, expand_version",
        "id, phrase, search_terms, match_groups, match_mode",
        "id, phrase, search_terms",
    )
    result = None
    for columns in selects:
        try:
            result = sb.table("keywords").select(columns).limit(200).execute()
            break
        except Exception:  # noqa: BLE001
            continue
    rows = (result.data or []) if result is not None else []
    pending = [r for r in rows if _keyword_needs_expand(r, force)][:limit]
    print(f"Keywords pending AI expansion: {len(pending)}")
    if pending:
        phrases = [str(r.get("phrase") or "") for r in pending]
        mark_jobs(
            sb,
            step="expand",
            status="running",
            title=job_title("扩展", phrases),
            detail=f"正在扩展 {phrase_label(phrases)} …",
            from_statuses=["queued", "running"],
        )
    done = 0
    for row in pending:
        phrase = (row.get("phrase") or "").strip()
        if not phrase:
            continue
        try:
            expanded = expand_keyword_phrase(phrase)
            terms = expanded["search_terms"] or [phrase]
            groups = expanded["match_groups"]
            mode = expanded["match_mode"]
            normalized = " ".join(normalize_for_match(t) for t in terms)
            payload = {
                "search_terms": terms,
                "ai_note": expanded.get("ai_note") or "",
                "normalized_phrase": normalized[:2000] or normalize_for_match(phrase),
                "match_groups": groups,
                "match_mode": mode,
                "exclude_terms": expanded.get("exclude_terms") or [],
                "expand_version": EXPAND_VERSION,
            }
            # Shed newer columns progressively so an un-migrated DB still gets its terms.
            def without(*cols: str) -> dict[str, Any]:
                return {k: v for k, v in payload.items() if k not in cols}

            attempts = (
                payload,
                without("exclude_terms", "expand_version"),
                without("exclude_terms", "expand_version", "match_groups", "match_mode"),
            )
            last_exc: Exception | None = None
            for attempt in attempts:
                try:
                    sb.table("keywords").update(attempt).eq("id", row["id"]).execute()
                    last_exc = None
                    break
                except Exception as exc:  # noqa: BLE001
                    last_exc = exc
            if last_exc is not None:
                raise last_exc
            done += 1
            print(f"  expanded: {phrase!r} mode={mode} groups={groups} terms={terms}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED keyword {row.get('id')}: {exc}", file=sys.stderr)
    if pending:
        phrases = [str(r.get("phrase") or "") for r in pending]
        mark_jobs(
            sb,
            step="expand",
            status="done" if done else "error",
            detail=f"扩展完成 {done}/{len(pending)} · {phrase_label(phrases)}",
            meta={
                "counts": {"done": done, "total": len(pending)},
                "phrases": [p for p in phrases if p],
                "items": [{"title": p} for p in phrases if p][:12],
            },
            from_statuses=["queued", "running"],
        )
    return done


def _has_body_column(sb: Any) -> bool:
    try:
        sb.table("articles").select("body_zh").limit(1).execute()
        return True
    except Exception:  # noqa: BLE001
        return False


def translate_one(article: dict[str, Any]) -> dict[str, str] | None:
    user = (
        "请改写下面这条新闻为中文短讯 JSON（含 title_zh/lead_zh/summary_zh/body_zh）：\n"
        + json.dumps(
            {
                "title": article.get("title") or "",
                "summary": (article.get("summary") or "")[:1200],
            },
            ensure_ascii=False,
        )
    )
    data = chat_json(TRANSLATE_SYSTEM, user, temperature=0.25)
    title_zh = str(data.get("title_zh") or "").strip()[:120]
    lead_zh = str(data.get("lead_zh") or "").strip()[:300]
    summary_zh = str(data.get("summary_zh") or "").strip()[:200]
    body_zh = str(data.get("body_zh") or "").strip()[:5000]
    if not title_zh:
        return None
    if not body_zh:
        body_zh = "\n\n".join(x for x in [lead_zh, summary_zh] if x)
    if not summary_zh:
        summary_zh = (lead_zh or body_zh)[:80]
    if not lead_zh and body_zh:
        lead_zh = body_zh.split("\n\n", 1)[0][:120]
    return {
        "title_zh": title_zh,
        "lead_zh": lead_zh,
        "summary_zh": summary_zh,
        "body_zh": body_zh,
    }


def translate_articles(limit: int = 40, force: bool = False) -> int:
    sb = get_supabase()
    with_body = _has_body_column(sb)
    select_cols = "id, title, summary, title_zh, body_zh" if with_body else "id, title, summary, title_zh"
    result = (
        sb.table("articles")
        .select(select_cols)
        .order("published_at", desc=True)
        .limit(120)
        .execute()
    )
    rows = result.data or []
    if not force:
        if with_body:
            rows = [r for r in rows if not (r.get("body_zh") or "").strip()]
        else:
            rows = [r for r in rows if not (r.get("title_zh") or "").strip()]
    rows = rows[:limit]
    print(f"Articles pending Chinese rewrite: {len(rows)} (force={force}, body_col={with_body})")
    if not rows:
        mark_jobs(
            sb,
            step="translate",
            status="done",
            detail="无需翻译",
            from_statuses=["queued", "running"],
        )
        return 0

    mark_jobs(
        sb,
        step="translate",
        status="running",
        detail=f"正在翻译 {len(rows)} 篇…",
        from_statuses=["queued", "running"],
    )

    done = 0
    items: list[dict[str, str]] = []
    for idx, row in enumerate(rows, start=1):
        try:
            out = translate_one(row)
            if not out:
                print(f"  skip empty result for {row.get('id')}")
                continue
            payload: dict[str, str] = {
                "title_zh": out["title_zh"],
                "summary_zh": out["summary_zh"],
            }
            if with_body:
                payload["lead_zh"] = out["lead_zh"]
                payload["body_zh"] = out["body_zh"]
            else:
                payload["summary_zh"] = "\n\n".join(
                    x for x in [out["lead_zh"], out["body_zh"]] if x
                )[:4000]
            sb.table("articles").update(payload).eq("id", row["id"]).execute()
            done += 1
            items.append(
                {
                    "id": str(row.get("id") or ""),
                    "title": out["title_zh"],
                    "summary": (out.get("summary_zh") or "")[:120],
                }
            )
            print(f"  [{idx}/{len(rows)}] {out['title_zh']}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED {row.get('id')}: {exc}", file=sys.stderr)

    mark_jobs(
        sb,
        step="translate",
        status="done" if done else "error",
        detail=f"翻译完成 {done}/{len(rows)}",
        meta={
            "counts": {"done": done, "total": len(rows)},
            "items": items[:20],
        },
        from_statuses=["queued", "running"],
    )
    return done


def main() -> None:
    if not ai_configured():
        print("AI_API_KEY not set — skip AI processing", file=sys.stderr)
        sys.exit(0)
    force = "--force-keywords" in sys.argv
    retranslate = "--retranslate" in sys.argv
    keywords_only = "--keywords-only" in sys.argv
    translate_only = "--translate-only" in sys.argv or retranslate
    k = a = 0
    if not translate_only:
        k = process_keywords(force=force)
    if not keywords_only:
        a = translate_articles(force=retranslate)
    print(f"Done. keywords_expanded={k} articles_translated={a}")


if __name__ == "__main__":
    main()
