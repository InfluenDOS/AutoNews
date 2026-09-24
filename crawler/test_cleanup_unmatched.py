"""Rejected crawl candidates are slimmed, not deleted, so relevance verdicts stay cached."""

from crawl import cleanup_unmatched_batch


class _Query:
    def __init__(self, client: "_Client", table: str) -> None:
        self.client = client
        self.table = table
        self.op = "select"
        self.payload = None
        self.ids: list[str] = []

    def select(self, *_a, **_k):
        return self

    def update(self, payload, **_k):
        self.op, self.payload = "update", payload
        return self

    def delete(self, **_k):
        self.op = "delete"
        return self

    def in_(self, _column, ids):
        self.ids = list(ids)
        return self

    def execute(self):
        self.client.calls.append((self.table, self.op, self.payload, self.ids))
        rows = {
            "article_hits": [{"article_id": "hit"}],
            "stars": [{"article_id": "starred"}],
            "articles": [
                {"id": i, "source": "Variety" if i == "preview" else "Blic"} for i in self.ids
            ],
        }.get(self.table, [])
        data = [r for r in rows if r.get("article_id", r.get("id")) in self.ids]
        return type("R", (), {"data": data})()


class _Client:
    def __init__(self) -> None:
        self.calls: list = []

    def table(self, name):
        return _Query(self, name)


def test_rejected_candidates_are_slimmed_not_deleted():
    sb = _Client()
    batch = {"hit", "starred", "preview", "rejected-1", "rejected-2"}
    assert cleanup_unmatched_batch(sb, batch) == 2
    assert not [c for c in sb.calls if c[1] == "delete"], "no article may be deleted"
    updates = [c for c in sb.calls if c[1] == "update"]
    assert len(updates) == 1
    _, _, payload, ids = updates[0]
    assert payload == {"body": "", "raw_text_normalized": ""}
    assert sorted(ids) == ["rejected-1", "rejected-2"]


if __name__ == "__main__":
    test_rejected_candidates_are_slimmed_not_deleted()
    print("ok")
