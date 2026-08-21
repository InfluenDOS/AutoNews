"""Expand Chinese keyword phrases and translate Serbian articles to Chinese."""

from __future__ import annotations

import sys
from typing import Any

from ai_client import ai_configured, chat_json
from normalize import normalize_for_match
from crawl import get_supabase


EXPAND_SYSTEM = """你是塞尔维亚新闻检索助手。用户会用中文描述想关注的话题（可能是模糊的一句话）。
请提取适合在塞尔维亚主流媒体标题/摘要中检索的关键词。

要求：
1. 输出 JSON：{"search_terms":["..."],"ai_note":"..."}
2. search_terms：6～15 个词，必须包含：
   - 若干短词/单词（更容易命中标题），例如 Kina、kineski、migranti、imigranti、Balkan、Srbija
   - 若干 2～4 词短语
   - 重要专名同时给拉丁与西里尔写法
3. 不要使用过于宽泛、几乎每条新闻都会命中的词（如 Srbija、Balkan、Beograd、vesti）作为单独检索词。
4. 把中文人名/机构/事件映射到塞尔维亚媒体常用写法。
5. ai_note：用一句中文说明你如何理解用户意图。
6. 不要只输出很长的完整句子；短词优先；不要 Markdown。"""


TRANSLATE_SYSTEM = """你是新闻翻译助手。把塞尔维亚语（或英文）新闻标题与摘要译成简体中文。
输出 JSON：{"items":[{"id":"...","title_zh":"...","summary_zh":"..."}]}
要求：忠实、简洁；专名可保留原文并在首次出现后加中文；summary_zh 可压缩到两句以内；不要 Markdown。"""


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
                # Fallback: keep original phrase as term
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


def translate_articles(limit: int = 40) -> int:
    sb = get_supabase()
    result = (
        sb.table("articles")
        .select("id, title, summary, title_zh")
        .order("published_at", desc=True)
        .limit(120)
        .execute()
    )
    rows = [r for r in (result.data or []) if not (r.get("title_zh") or "").strip()][:limit]
    print(f"Articles pending Chinese translation: {len(rows)}")
    if not rows:
        return 0

    done = 0
    batch_size = 8
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        payload = {
            "items": [
                {
                    "id": r["id"],
                    "title": r.get("title") or "",
                    "summary": (r.get("summary") or "")[:800],
                }
                for r in batch
            ]
        }
        try:
            data = chat_json(
                TRANSLATE_SYSTEM,
                f"请翻译以下新闻（JSON）：\n{payload}",
                temperature=0.1,
            )
            items = data.get("items") or []
            by_id = {str(it.get("id")): it for it in items if isinstance(it, dict)}
            for r in batch:
                it = by_id.get(str(r["id"]))
                if not it:
                    continue
                title_zh = str(it.get("title_zh") or "").strip()[:500]
                summary_zh = str(it.get("summary_zh") or "").strip()[:2000]
                if not title_zh:
                    continue
                sb.table("articles").update(
                    {"title_zh": title_zh, "summary_zh": summary_zh}
                ).eq("id", r["id"]).execute()
                done += 1
            print(f"  translated batch {i // batch_size + 1}: +{len(by_id)}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED translate batch: {exc}", file=sys.stderr)
    return done


def main() -> None:
    if not ai_configured():
        print("AI_API_KEY not set — skip AI processing", file=sys.stderr)
        sys.exit(0)
    force = "--force-keywords" in sys.argv
    keywords_only = "--keywords-only" in sys.argv
    translate_only = "--translate-only" in sys.argv
    k = a = 0
    if not translate_only:
        k = process_keywords(force=force)
    if not keywords_only:
        a = translate_articles()
    print(f"Done. keywords_expanded={k} articles_translated={a}")


if __name__ == "__main__":
    main()
