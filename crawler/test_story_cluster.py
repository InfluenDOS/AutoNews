import story_cluster
from story_cluster import classify_pair, cluster_stories, propose_pairs, shown_together
from dedup import title_tokens

PUB = "2026-09-05T20:59:00+00:00"
PUB2 = "2026-09-05T20:53:00+00:00"
PUB3 = "2026-09-05T20:33:00+00:00"


def check(name: str, got, want) -> None:
    if got != want:
        raise SystemExit(f"FAIL {name}: got {got!r} want {want!r}")
    print(f"ok  {name}")


ZH_A = "塞尔维亚逮捕一名23岁中国公民 涉嫌向警察行贿"
ZH_B = "塞尔维亚逮捕一名涉嫌行贿的中国公民"
ZH_C = "中国公民涉嫌向塞尔维亚边境警察行贿被拘"

a = {
    "id": "aa000000-0000-0000-0000-000000000001",
    "source": "Blic",
    "title": "Uhapsen kineski drzavljanin zbog mito",
    "title_zh": ZH_A,
    "summary": "Uhapsen tokom kontrole na granici.",
    "published_at": PUB,
}
b = {
    "id": "aa000000-0000-0000-0000-000000000002",
    "source": "Danas",
    "title": "Kineski drzavljanin Y.Q. uhapsen zbog pokusaja podmicivanja",
    "title_zh": ZH_B,
    "summary": "Drzavljanin Y.Q. pokusao mito na granici.",
    "published_at": PUB2,
}
c = {
    "id": "aa000000-0000-0000-0000-000000000003",
    "source": "N1 Serbia",
    "title": "MUP: kineski drzavljanin pritvoren zbog mito granicnim policajcima",
    "title_zh": ZH_C,
    "summary": "23-godisnji kineski drzavljanin priveden 48 sati.",
    "published_at": PUB3,
}
other = {
    "id": "aa000000-0000-0000-0000-000000000009",
    "source": "Blic",
    "title": "Poplave pogodile Beograd",
    "title_zh": "贝尔格莱德遭遇洪水",
    "summary": "Reke izlile.",
    "published_at": PUB,
}
arrest2 = {
    "id": "aa000000-0000-0000-0000-000000000008",
    "source": "Blic",
    "title": "Uhapsen hrvatski drzavljanin zbog kradje u Novom Sadu",
    "title_zh": "塞尔维亚逮捕一名克罗地亚公民涉嫌在诺维萨德盗窃",
    "summary": "Kradja u prodavnici.",
    "published_at": PUB,
}

check("spaced CJK yields bigrams", len(title_tokens(ZH_A)) > 8, True)
check("screenshot pair is AI candidate", classify_pair(a, b), "ai")
check("screenshot pair B-C is AI candidate", classify_pair(b, c), "ai")
check("unrelated flood is skip", classify_pair(a, other), "skip")
check("different arrest is not rule-same", classify_pair(a, arrest2) != "same", True)

rule, ai = propose_pairs([a, b, c], [a, b, c, other], set())
check("no rule-same on paraphrases", len(rule), 0)
check("three screenshot articles yield AI pairs", len(ai) >= 2, True)

similar = {
    "id": "aa000000-0000-0000-0000-000000000011",
    "source": "Blic",
    "title": "Narodna stranka podržala Vučića za premijera",
    "title_zh": "",
    "published_at": "2026-09-05T14:14:00+00:00",
}
similar2 = {
    "id": "aa000000-0000-0000-0000-000000000012",
    "source": "Danas",
    "title": "Narodna stranka podržala Vučića u kampanji za premijera",
    "title_zh": "",
    "published_at": "2026-09-05T14:07:00+00:00",
}
rule2, ai2 = propose_pairs([similar], [similar, similar2], set())
check("high Jaccard writes rule pair", len(rule2), 1)
check("rule pair marked same", rule2[0]["same"], True)
check("rule pair skips AI", len(ai2), 0)

existing = {(similar["id"], similar2["id"]) if similar["id"] < similar2["id"] else (similar2["id"], similar["id"])}
rule3, ai3 = propose_pairs([similar], [similar, similar2], existing)
check("existing pair not proposed again", (len(rule3), len(ai3)), (0, 0))

check("no reader map keeps every pair", shown_together("x", "y", None), True)
check("shared reader keeps pair", shown_together("x", "y", {"x": {"u1"}, "y": {"u1", "u2"}}), True)
check("disjoint readers drop pair", shown_together("x", "y", {"x": {"u1"}, "y": {"u2"}}), False)
check("reader-less preview keeps pair", shown_together("x", "y", {"x": {"u1"}}), True)

split_readers = {a["id"]: {"u1"}, b["id"]: {"u2"}, c["id"]: {"u1", "u2"}}
_, ai_split = propose_pairs([a, b, c], [a, b, c], set(), split_readers)
ai_split_keys = {tuple(sorted((l["id"], r["id"]))) for l, r in ai_split}
check("pair across disjoint feeds not sent to AI", tuple(sorted((a["id"], b["id"]))) in ai_split_keys, False)
check("pairs inside one feed still sent", len(ai_split_keys), 2)


def _fake_story_chat(_system: str, user: str, **_kw: object) -> dict:
    import json as _json

    sent = _json.loads(user)["pairs"]
    _fake_story_chat.sent = sent
    return {"results": [{"n": p["n"], "same": p["n"] == 1, "reason": "mock"} for p in sent]}


_saved_story = (story_cluster.chat_json, story_cluster.ai_configured)
story_cluster.chat_json = _fake_story_chat
story_cluster.ai_configured = lambda: True
try:
    scored = story_cluster.score_story_pairs([(a, b), (b, c)])
finally:
    story_cluster.chat_json, story_cluster.ai_configured = _saved_story
check("story prompt carries no UUIDs", "aa000000" in str(_fake_story_chat.sent), False)
check(
    "story verdicts map back by pair number",
    {(r["article_lo"], r["article_hi"]): r["same"] for r in scored},
    {(a["id"], b["id"]): True, (b["id"], c["id"]): False},
)


class _FakeQuery:
    def __init__(self, store: dict, table: str):
        self.store = store
        self.table = table

    def select(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def or_(self, *_a, **_k):
        return self

    def gte(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a, **_k):
        return self

    def upsert(self, rows, **_k):
        self.store.setdefault(self.table, []).extend(rows)
        return self

    def execute(self):
        class R:
            data: list = []

        if self.table == "articles":
            R.data = self.store.get("articles", [])
        elif self.table == "article_hits":
            R.data = self.store.get("article_hits", [])
        elif self.table == "article_story_pairs":
            R.data = list(self.store.get("article_story_pairs", []))
        return R()


class _FakeSB:
    def __init__(self, store: dict):
        self.store = store

    def table(self, name: str):
        return _FakeQuery(self.store, name)


store = {
    "articles": [a, b, c],
    "article_hits": [
        {"user_id": "u1", "article_id": a["id"]},
        {"user_id": "u1", "article_id": b["id"]},
        {"user_id": "u1", "article_id": c["id"]},
    ],
    "article_story_pairs": [],
}


def fake_score(pairs):
    rows = []
    for left, right in pairs:
        lo, hi = sorted((left["id"], right["id"]))
        rows.append(
            {
                "article_lo": lo,
                "article_hi": hi,
                "same": True,
                "reason": "mock",
            }
        )
    return rows


wrote = cluster_stories(
    _FakeSB(store),
    [a["id"], b["id"], c["id"]],
    score_fn=fake_score,
)
check("mock AI writes pairs", wrote >= 2, True)
sames = [r for r in store["article_story_pairs"] if r.get("same")]
check("mock AI marked same", len(sames) >= 2, True)

print("story_cluster tests passed")
