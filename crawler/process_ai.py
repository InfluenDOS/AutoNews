"""Expand Chinese keyword phrases and rewrite foreign-language articles into Chinese."""

from __future__ import annotations

import json
import sys
from typing import Any

from ai_client import ai_configured, chat_json
from crawl import get_supabase
from normalize import (
    clean_match_groups,
    expand_match_terms,
    normalize_for_match,
    suggest_match_mode,
)


EXPAND_SYSTEM = """你是多语种新闻检索助手。用户用中文描述想关注的话题。
请把意图拆成「检索结构」，用于在巴尔干等外语媒体标题/摘要中命中。

只输出 JSON：
{
  "match_mode": "strict" 或 "loose",
  "match_groups": [["变体A","变体B"], ["变体C","变体D"]],
  "search_terms": ["可选的完整短语…"],
  "ai_note": "一句中文说明"
}

规则：
1. 短话题（如「武契奇」「选举」）：match_mode=loose；match_groups 可空；search_terms 给 4～10 个多词短语，彼此为 OR。
2. 长意图（含多个要素，如「中国籍非法移民在巴尔干的活动」）：match_mode=strict；
   match_groups 给 2～4 组要素（每组是同义/多语变体）。召回阶段会放宽，再由第二阶段相关性复核过滤。
   例如：[["kineski","kineskih","Chinese"],["migranti","ilegalni migranti"],["Balkan","Srbija","BiH"]]。
3. 严禁把过宽单词语单独作为一整组（如单独的 China、migrant、Balkan、news）。
4. 变体用目标媒体常见原文（塞/克/波、阿尔巴尼亚语、英语等）；ai_note 用中文；不要 Markdown。
5. 多要素意图务必输出 match_mode=strict 且至少 2 组 match_groups。"""


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


def expand_keyword_phrase(phrase: str) -> dict[str, Any]:
    suggested = suggest_match_mode(phrase)
    data = chat_json(
        EXPAND_SYSTEM,
        f"用户输入：{phrase}\n（系统建议 match_mode={suggested}，长意图请用 strict+match_groups）",
    )

    groups = clean_match_groups(data.get("match_groups"))
    terms_raw = data.get("search_terms") or []
    if not isinstance(terms_raw, list):
        terms_raw = []
    terms = expand_match_terms(phrase, [str(t) for t in terms_raw])

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
            terms = [phrase]

    note = str(data.get("ai_note") or "").strip()[:300]
    return {
        "match_mode": mode,
        "match_groups": groups,
        "search_terms": terms[:12],
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
    # Re-expand long intents that never got structured groups
    if suggest_match_mode(phrase) == "strict":
        cleaned = clean_match_groups(groups)
        if len(cleaned) < 2:
            return True
    return False


def process_keywords(limit: int = 30, force: bool = False) -> int:
    sb = get_supabase()
    try:
        result = (
            sb.table("keywords")
            .select("id, phrase, search_terms, match_groups, match_mode")
            .limit(200)
            .execute()
        )
    except Exception:  # noqa: BLE001
        result = sb.table("keywords").select("id, phrase, search_terms").limit(200).execute()
    rows = result.data or []
    pending = [r for r in rows if _keyword_needs_expand(r, force)][:limit]
    print(f"Keywords pending AI expansion: {len(pending)}")
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
            }
            try:
                sb.table("keywords").update(payload).eq("id", row["id"]).execute()
            except Exception:  # noqa: BLE001
                # Pre-migration DB without match_* columns
                payload.pop("match_groups", None)
                payload.pop("match_mode", None)
                sb.table("keywords").update(payload).eq("id", row["id"]).execute()
            done += 1
            print(f"  expanded: {phrase!r} mode={mode} groups={groups} terms={terms}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED keyword {row.get('id')}: {exc}", file=sys.stderr)
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
        return 0

    done = 0
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
            print(f"  [{idx}/{len(rows)}] {out['title_zh']}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED {row.get('id')}: {exc}", file=sys.stderr)
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
