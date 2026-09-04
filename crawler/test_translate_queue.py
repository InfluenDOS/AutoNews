"""Tests for Chinese-rewrite queue selection (avoid stuck「等待中文改写」)."""

from process_ai import article_needs_zh, pick_translate_batch


def test_article_needs_zh_matches_feed_ui():
    assert article_needs_zh({"title_zh": "", "body_zh": ""}, with_body=True)
    assert article_needs_zh({"title_zh": "  ", "body_zh": "正文"}, with_body=True)
    assert article_needs_zh({"title_zh": "标题", "body_zh": ""}, with_body=True)
    assert not article_needs_zh({"title_zh": "标题", "body_zh": "正文"}, with_body=True)
    assert not article_needs_zh({"title_zh": "标题", "body_zh": ""}, with_body=False)


def test_pick_translate_batch_prefers_hits_over_preview():
    rows = [
        {"id": "preview-new", "title_zh": "", "body_zh": ""},
        {"id": "hit-old", "title_zh": "", "body_zh": ""},
        {"id": "preview-2", "title_zh": "", "body_zh": ""},
        {"id": "hit-2", "title_zh": "", "body_zh": ""},
        {"id": "done", "title_zh": "已译", "body_zh": "正文"},
    ]
    batch = pick_translate_batch(
        rows,
        {"hit-old", "hit-2"},
        limit=3,
        with_body=True,
    )
    assert [r["id"] for r in batch] == ["hit-old", "hit-2", "preview-new"]


def test_pick_translate_batch_can_drain_older_hits_beyond_tiny_window():
    """Regression: old untranslated hits must not be dropped once newer rows arrive."""
    rows = [{"id": f"p{i}", "title_zh": "", "body_zh": ""} for i in range(50)]
    rows.append({"id": "stuck-hit", "title_zh": "", "body_zh": ""})
    batch = pick_translate_batch(
        rows,
        {"stuck-hit"},
        limit=5,
        with_body=True,
    )
    assert batch[0]["id"] == "stuck-hit"
    assert len(batch) == 5
