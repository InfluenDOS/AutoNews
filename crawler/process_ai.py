"""Expand Chinese keyword phrases and translate Serbian articles to Chinese."""

from __future__ import annotations

import json
import sys
from typing import Any

from ai_client import ai_configured, chat_json
from normalize import normalize_for_match
from crawl import get_supabase


EXPAND_SYSTEM = """你是塞尔维亚新闻检索助手。用户用中文描述话题（可能较模糊）。
请提取能在塞尔维亚媒体标题/摘要中精准命中的检索短语。

输出 JSON：{"search_terms":["..."],"ai_note":"..."}

硬性规则：
1. search_terms 只给 4～10 个「短语」，每个至少 2 个词（例如 kineski migranti、kineski ilegalci、predsednik Vučić、premijer Srbije）。
2. 禁止单独输出过宽单词语：Kina、kineski、migranti、imigranti、ilegalni、Srbija、Balkan、Beograd、vesti、premijer、premijerka、predsednik、predsednica、vlada。
3. 注意假朋友：premijera=电影首映，premijer=总理；绝不要用会误伤「首映/文化娱乐」的过短词。
4. 短语要同时体现用户意图的核心要素（例如「中国籍」+「非法移民/移民」），避免只命中其中一个要素的新闻。
5. 可含拉丁与西里尔专名写法；ai_note 用一句中文说明；不要 Markdown。"""


TRANSLATE_SYSTEM = """你是新华社/财新风格的国际新闻改写编辑。输入可能是塞尔维亚语（拉丁或西里尔）或英语的耸动标题+摘要。
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
4. 人名地名用通行中文：Vučić/Вучић=武契奇，Beograd=贝尔格莱德，Srbija=塞尔维亚，Kosovo=科索沃，EU=欧盟，NATO=北约，dinar=第纳尔。生僻名用「中文（原文）」。
5. 严禁机翻腔：不要「进行了…的表示」「关于…一事」「据报道称称」；不要把塞尔维亚语词序硬搬进中文。
6. 只使用输入里有的信息，可改写重组，不可编造数字、引语、原因。
7. 不要 Markdown，不要解释。"""


def expand_keyword_phrase(phrase: str) -> dict[str, Any]:
    data = chat_json(EXPAND_SYSTEM, f"用户输入：{phrase}")
    terms = data.get("search_terms") or []
    if not isinstance(terms, list):
        terms = []
    cleaned = []
    seen: set[str] = set()
    for t in terms:
        s = str(t).strip()
        if not s:
            continue
        key = normalize_for_match(s)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(s[:80])
    note = str(data.get("ai_note") or "").strip()[:300]
    return {"search_terms": cleaned[:12], "ai_note": note}


def process_keywords(limit: int = 30, force: bool = False) -> int:
    sb = get_supabase()
    result = (
        sb.table("keywords")
        .select("id, phrase, search_terms")
        .limit(200)
        .execute()
    )
    rows = result.data or []
    if force:
        pending = rows[:limit]
    else:
        pending = [r for r in rows if not (r.get("search_terms") or [])][:limit]
    print(f"Keywords pending AI expansion: {len(pending)}")
    done = 0
    for row in pending:
        phrase = (row.get("phrase") or "").strip()
        if not phrase:
            continue
        try:
            expanded = expand_keyword_phrase(phrase)
            terms = expanded["search_terms"]
            if not terms:
                terms = [phrase]
            normalized = " ".join(normalize_for_match(t) for t in terms)
            sb.table("keywords").update(
                {
                    "search_terms": terms,
                    "ai_note": expanded.get("ai_note") or "",
                    "normalized_phrase": normalized[:2000] or normalize_for_match(phrase),
                }
            ).eq("id", row["id"]).execute()
            done += 1
            print(f"  expanded: {phrase!r} -> {terms}")
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
                # Fallback: pack lead+body into summary_zh for older schema
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
