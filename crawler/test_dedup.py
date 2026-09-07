from dedup import drop_near_duplicate_hits, title_tokens, titles_near_duplicate, titles_similar
from sources import clear_registered_news_names, is_news_source, register_news_names
from user_sources import allowed_names_for_user, collect_crawl_sources
from sources import NEWS_SOURCE_NAMES


def check(name: str, got, want) -> None:
    if got != want:
        raise SystemExit(f"FAIL {name}: got {got!r} want {want!r}")
    print(f"ok  {name}")


check(
    "similar Serbian election titles",
    titles_near_duplicate(
        "Narodna stranka podržala Vučića za premijera",
        "Narodna stranka podržala Vučića u kampanji za premijera",
        "2026-09-05T14:14:00+00:00",
        "2026-09-05T14:07:00+00:00",
    ),
    True,
)
ZH_A = "\u585e\u5c14\u7ef4\u4e9a\u4eba\u6c11\u515a\u652f\u6301\u6b66\u5951\u5947\u51fa\u4efb\u603b\u7406\u5019\u9009\u4eba"
ZH_B = "\u585e\u5c14\u7ef4\u4e9a\u4eba\u6c11\u515a\u652f\u6301\u6b66\u5951\u5947\u7ade\u9009\u603b\u7406"
check("Chinese rewrite titles are near-duplicates", titles_similar(ZH_A, ZH_B), True)
check("CJK tokeniser yields bigrams", len(title_tokens(ZH_A)) > 4, True)
check(
    "unrelated titles are not duplicates",
    titles_near_duplicate(
        "Poplave u Beogradu",
        "Izbori u Hrvatskoj",
        "2026-09-05T14:14:00+00:00",
        "2026-09-05T14:07:00+00:00",
    ),
    False,
)
check(
    "far-apart dates are not duplicates",
    titles_near_duplicate(
        "Srpska narodna stranka podržala Vučića za premijera",
        "Srpska narodna stranka podržala Vučića za premijera",
        "2026-09-01T10:00:00+00:00",
        "2026-09-05T14:00:00+00:00",
    ),
    False,
)

new_hits = [
    {"user_id": "u1", "article_id": "a2"},
    {"user_id": "u1", "article_id": "a3"},
]
kept = drop_near_duplicate_hits(
    new_hits,
    new_meta={
        "a2": {
            "title": "Narodna stranka podržala Vučića za premijera",
            "published_at": "2026-09-05T14:14:00+00:00",
        },
        "a3": {
            "title": "Poplave pogodile Beograd",
            "published_at": "2026-09-05T16:00:00+00:00",
        },
    },
    existing={
        "u1": [
            {
                "title": "Narodna stranka podržala Vučića u kampanji za premijera",
                "published_at": "2026-09-05T14:07:00+00:00",
            }
        ]
    },
)
check("keep near-duplicate hits for alt-source grouping", [h["article_id"] for h in kept], ["a2", "a3"])

SPACED_ZH = "塞尔维亚逮捕一名23岁中国公民 涉嫌向警察行贿"
check("CJK tokens ignore spaces", len(title_tokens(SPACED_ZH)) > 4, True)

check("zero bundles keep Serbia default", allowed_names_for_user([]), set(NEWS_SOURCE_NAMES))
check(
    "disabled preset plus custom uses custom only",
    allowed_names_for_user(
        [
            {
                "kind": "preset",
                "preset_key": "serbia_mainstream",
                "enabled": False,
                "status": "ready",
            },
            {
                "kind": "fuzzy",
                "enabled": True,
                "status": "ready",
                "resolved_feeds": [{"name": "Jutarnji", "url": "https://www.jutarnji.hr/rss", "country": "HR"}],
            },
        ]
    ),
    {"Jutarnji"},
)

feeds, extra, by_user = collect_crawl_sources(
    [
        {
            "user_id": "u1",
            "kind": "rss",
            "enabled": True,
            "status": "ready",
            "resolved_feeds": [{"name": "Jutarnji", "url": "https://www.jutarnji.hr/rss", "country": "HR"}],
        }
    ]
)
check("custom feed is scheduled", any(f.name == "Jutarnji" for f in feeds), True)
check("custom name collected", "Jutarnji" in extra, True)
check("user with custom still keeps default Serbia", "Blic" in by_user["u1"], True)

clear_registered_news_names()
check("Jutarnji is not news until registered", is_news_source("Jutarnji"), False)
register_news_names({"Jutarnji"})
check("registered custom name is news", is_news_source("Jutarnji"), True)
check("preview still blocked", is_news_source("Variety"), False)
clear_registered_news_names()

print("all dedup/source checks passed")
