"""Tests for Chinese-rewrite queue selection (avoid stuck「等待中文改写」)."""

from process_ai import (
    CATCH_UP_MARK,
    article_needs_zh,
    is_catch_up_row,
    pick_translate_batch,
)


def test_article_needs_zh_matches_feed_ui():
    assert article_needs_zh({"title_zh": "", "body_zh": ""}, with_body=True)
    assert article_needs_zh({"title_zh": "  ", "body_zh": "正文"}, with_body=True)
    assert article_needs_zh({"title_zh": "标题", "body_zh": ""}, with_body=True)
    assert not article_needs_zh({"title_zh": "标题", "body_zh": "正文"}, with_body=True)
    assert not article_needs_zh({"title_zh": "标题", "body_zh": ""}, with_body=False)


def test_is_catch_up_row_for_failures_and_deferred():
    assert is_catch_up_row({"translate_attempts": 2, "translate_error": "boom"})
    assert is_catch_up_row({"translate_attempts": 0, "translate_error": CATCH_UP_MARK})
    assert not is_catch_up_row({"translate_attempts": 0, "translate_error": ""})


def test_pick_translate_batch_reserves_catch_up_inside_limit():
    fresh = [{"id": f"new-{i}", "title_zh": "", "body_zh": ""} for i in range(40)]
    catch_up = [
        {
            "id": "stuck-old",
            "title_zh": "",
            "body_zh": "",
            "translate_attempts": 1,
            "translate_error": "empty_model_result",
        },
        {
            "id": "deferred",
            "title_zh": "",
            "body_zh": "",
            "translate_attempts": 0,
            "translate_error": CATCH_UP_MARK,
        },
    ]
    batch = pick_translate_batch(
        fresh,
        catch_up,
        limit=40,
        catch_up_max=8,
        with_body=True,
    )
    assert len(batch) == 40
    assert batch[0]["id"] == "stuck-old"
    assert batch[1]["id"] == "deferred"
    assert {r["id"] for r in batch[:2]} == {"stuck-old", "deferred"}
    # Still capped — does not raise the overall budget.
    assert len(batch) == 40


def test_pick_translate_batch_does_not_inflate_token_budget():
    fresh = [{"id": f"n{i}", "title_zh": "", "body_zh": ""} for i in range(100)]
    catch_up = [{"id": f"c{i}", "title_zh": "", "body_zh": "", "translate_attempts": 1} for i in range(20)]
    batch = pick_translate_batch(
        fresh,
        catch_up,
        limit=40,
        catch_up_max=8,
        with_body=True,
    )
    assert len(batch) == 40
    assert sum(1 for r in batch if str(r["id"]).startswith("c")) == 8
