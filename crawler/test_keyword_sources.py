"""Per-keyword sources: run with `python test_keyword_sources.py`.

The guarantee checked here: a keyword without its own sources (every keyword made
before the feature) matches and prompts exactly as before.
"""

from __future__ import annotations

import json
import sys

import crawl
import process_ai
import relevance
from sources import NEWS_SOURCE_NAMES
from user_sources import SERBIA_MAINSTREAM_KEY, keyword_scope

failures: list[str] = []


def check(label: str, got: object, want: object) -> None:
    if got != want:
        failures.append(f"{label}: got {got!r} want {want!r}")
        print(f"FAIL {label}")
    else:
        print(f"ok  {label}")


BBC = {
    "id": "b1",
    "user_id": "u1",
    "kind": "rss",
    "enabled": True,
    "status": "ready",
    "resolved_feeds": [{"name": "BBC World", "url": "https://feeds.bbci.co.uk/news/world/rss.xml"}],
}
BROKEN = {**BBC, "id": "b2", "status": "error"}

# --- scope resolution
check("no source_keys keeps old behaviour", keyword_scope({"source_keys": None}, [BBC]), None)
check("empty source_keys keeps old behaviour", keyword_scope({"source_keys": []}, [BBC]), None)
serbia = keyword_scope({"source_keys": [SERBIA_MAINSTREAM_KEY]}, [BBC])
check("built-in set reads the Serbian outlets", serbia.names, frozenset(NEWS_SOURCE_NAMES))
check("built-in set keeps the Serbia prompts", serbia.feeds, ())
bbc = keyword_scope({"source_keys": ["b1"]}, [BBC])
check("custom source limits names", bbc.names, frozenset({"BBC World"}))
check("custom source switches prompts", [f.name for f in bbc.feeds], ["BBC World"])
check("failed source is skipped", keyword_scope({"source_keys": ["b2"]}, [BROKEN]), None)
check("deleted source falls back to every source", keyword_scope({"source_keys": ["gone"]}, [BBC]), None)

# --- matching: unscoped rows ignore scopes entirely
row = {
    "id": "k1",
    "phrase": "武契奇",
    "search_terms": ["Vučić"],
    "match_groups": [],
    "match_mode": "loose",
    "exclude_terms": [],
}
blic = {"source": "Blic", "title": "Vučić o izborima", "summary": ""}
bbc_art = {"source": "BBC World", "title": "Vučić meets EU leaders", "summary": ""}
users = {"u1": [dict(row)]}
crawl.attach_keyword_scopes(users, [BBC])
allowed = {"u1": set(NEWS_SOURCE_NAMES)}
check("unscoped keyword: Blic matches", len(crawl.matching_keyword_rows(blic, users, allowed)), 1)
check("unscoped keyword: source outside user set does not", len(crawl.matching_keyword_rows(bbc_art, users, allowed)), 0)
check("unscoped keyword prompts unchanged", crawl.scope_feeds(users["u1"][0]), None)

scoped = {"u1": [{**row, "source_keys": ["b1"]}]}
crawl.attach_keyword_scopes(scoped, [BBC])
check("scoped keyword: own source matches", len(crawl.matching_keyword_rows(bbc_art, scoped, allowed)), 1)
check("scoped keyword: other sources do not", len(crawl.matching_keyword_rows(blic, scoped, allowed)), 0)

# --- prompts: without feeds the request is the original one, byte for byte
sent: list[tuple[str, str]] = []


def fake_chat(system: str, user: str, **_kw: object) -> dict:
    sent.append((system, user))
    return {"results": [], "search_terms": ["x"], "match_groups": []}


saved = (relevance.chat_json, relevance.ai_configured, process_ai.chat_json)
relevance.chat_json = fake_chat
relevance.ai_configured = lambda: True
process_ai.chat_json = fake_chat
try:
    item = {"article_id": "a1", "title": "T", "summary": "S", "source": "Blic"}
    relevance.score_batch("塞尔维亚选举", [item], avoid=["izbor"])
    relevance.score_batch("塞尔维亚选举", [item], avoid=["izbor"], feeds=None)
    relevance.score_batch("UK", [item], feeds=[{"name": "BBC World", "url": "u"}])
    process_ai.expand_keyword_phrase("塞尔维亚选举")
    process_ai.expand_keyword_phrase("英国首相", [{"name": "BBC World", "url": "u"}])
finally:
    relevance.chat_json, relevance.ai_configured, process_ai.chat_json = saved

check("relevance default uses the Serbia prompt", sent[0][0], relevance.RELEVANCE_SYSTEM)
check(
    "relevance default payload is the original shape",
    json.loads(sent[0][1]),
    {
        "intent": "塞尔维亚选举",
        "wrong_sense_terms": ["izbor"],
        "articles": [{"id": "1", "source": "Blic", "title": "T", "text": "S"}],
    },
)
check("feeds=None is the same request", sent[1], sent[0])
check("feeds switch to the any-region prompt", sent[2][0], relevance.RELEVANCE_SYSTEM_ANY_REGION)
check("any-region payload names the outlets", json.loads(sent[2][1])["sources"], ["BBC World"])
check("expand default uses the Serbia prompt", sent[3][0], process_ai.EXPAND_SYSTEM)
check(
    "expand default message is unchanged",
    sent[3][1],
    "用户输入：塞尔维亚选举\n（建议 match_mode=loose；检索词必须是塞尔维亚语/英语原文，不要中文；"
    "若意图含地点，match_groups 必须单独有一组地点变体；多义词请消歧或写进 exclude_terms）",
)
check("expand with feeds uses the any-region prompt", sent[4][0], process_ai.EXPAND_SYSTEM_ANY_REGION)
check("expand with feeds lists the outlets", "BBC World（u）" in sent[4][1], True)

if failures:
    print(f"FAILED ({len(failures)}):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("keyword source checks passed")
