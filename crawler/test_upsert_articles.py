"""Tests for article upserts: bodies are kept and custom feeds cannot overwrite rows."""

from crawl import upsert_articles


class _Query:
    def __init__(self, calls: list, rows: list, insert_only: bool) -> None:
        self.calls = calls
        self.rows = rows
        self.insert_only = insert_only

    def execute(self):
        keys = set().union(*(r.keys() for r in self.rows))
        # PostgREST sends the union of keys; a missing body would become NULL.
        if "body" in keys and any("body" not in r for r in self.rows):
            raise RuntimeError('null value in column "body"')
        self.calls.append((self.rows, self.insert_only))
        return type("R", (), {"data": self.rows})()


class _Table:
    def __init__(self, calls: list) -> None:
        self.calls = calls

    def upsert(self, rows, on_conflict, ignore_duplicates=False, returning=None):
        return _Query(self.calls, rows, ignore_duplicates)


class _Client:
    def __init__(self) -> None:
        self.calls: list = []

    def table(self, name):
        return _Table(self.calls)


def test_bodies_survive_a_batch_mixed_with_preview_rows():
    sb = _Client()
    rows = [
        {"url": "https://a", "source": "Blic", "title": "A", "body": "full text"},
        {"url": "https://b", "source": "Blic", "title": "B", "body": ""},
        {"url": "https://preview", "source": "Variety", "title": "P"},
    ]
    assert upsert_articles(sb, rows) == 3
    written = [r for call, _ in sb.calls for r in call]
    assert {"url": "https://a", "source": "Blic", "title": "A", "body": "full text"} in written
    # Rows without a fetched body omit the column so a stored body is not wiped.
    assert all("body" not in r for r in written if r["url"] != "https://a")


def test_custom_feed_articles_never_overwrite_existing_rows():
    sb = _Client()
    rows = [
        {"url": "https://real", "source": "N1 Serbia", "title": "Real"},
        {"url": "https://custom", "source": "My Feed", "title": "Custom", "body": "text"},
    ]
    upsert_articles(sb, rows)
    mode = {r["url"]: insert_only for call, insert_only in sb.calls for r in call}
    assert mode == {"https://real": False, "https://custom": True}


def test_custom_feed_cannot_borrow_a_builtin_name():
    from user_sources import collect_crawl_sources

    bundle = {
        "user_id": "u1",
        "kind": "rss",
        "enabled": True,
        "status": "ready",
        "resolved_feeds": [
            {"name": "Blic", "url": "https://evil.example/rss"},
            {"name": "variety", "url": "https://evil.example/preview"},
            {"name": "Blic", "url": "https://www.blic.rs/rss/vesti"},
            {"name": "Avaz", "url": "https://avaz.ba/rss"},
        ],
    }
    feeds, extra_names, _ = collect_crawl_sources([bundle])
    urls = {f.url for f in feeds}
    assert "https://evil.example/rss" not in urls
    assert "https://evil.example/preview" not in urls
    assert "https://avaz.ba/rss" in urls
    assert extra_names == {"Blic", "Avaz"}


if __name__ == "__main__":
    test_bodies_survive_a_batch_mixed_with_preview_rows()
    test_custom_feed_articles_never_overwrite_existing_rows()
    test_custom_feed_cannot_borrow_a_builtin_name()
    print("ok")
