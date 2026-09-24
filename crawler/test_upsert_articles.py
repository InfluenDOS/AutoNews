"""Tests for article upserts keeping fetched bodies (NOT NULL body column)."""

from crawl import upsert_articles


class _Query:
    def __init__(self, calls: list, rows: list) -> None:
        self.calls = calls
        self.rows = rows

    def execute(self):
        keys = set().union(*(r.keys() for r in self.rows))
        # PostgREST sends the union of keys; a missing body would become NULL.
        if "body" in keys and any("body" not in r for r in self.rows):
            raise RuntimeError('null value in column "body"')
        self.calls.append(self.rows)
        return type("R", (), {"data": self.rows})()


class _Table:
    def __init__(self, calls: list) -> None:
        self.calls = calls

    def upsert(self, rows, on_conflict):
        return _Query(self.calls, rows)


class _Client:
    def __init__(self) -> None:
        self.calls: list = []

    def table(self, name):
        return _Table(self.calls)


def test_bodies_survive_a_batch_mixed_with_preview_rows():
    sb = _Client()
    rows = [
        {"url": "https://a", "title": "A", "body": "full text"},
        {"url": "https://b", "title": "B", "body": ""},
        {"url": "https://preview", "title": "P"},
    ]
    assert upsert_articles(sb, rows) == 3
    written = [r for call in sb.calls for r in call]
    assert {"url": "https://a", "title": "A", "body": "full text"} in written
    # Rows without a fetched body omit the column so a stored body is not wiped.
    assert all("body" not in r for r in written if r["url"] != "https://a")


if __name__ == "__main__":
    test_bodies_survive_a_batch_mixed_with_preview_rows()
    print("ok")
