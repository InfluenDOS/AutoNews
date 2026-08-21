"""Helpers to publish pipeline progress into public.user_jobs for the UI."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def mark_jobs(
    sb: Any,
    *,
    step: str,
    status: str,
    detail: str = "",
    title: str | None = None,
    from_statuses: list[str] | None = None,
) -> None:
    try:
        q = sb.table("user_jobs").update(
            {
                "status": status,
                "detail": detail,
                "updated_at": _now(),
                **({"title": title} if title else {}),
            }
        ).eq("step", step)
        if from_statuses:
            q = q.in_("status", from_statuses)
        else:
            q = q.in_("status", ["queued", "running"])
        q.execute()
    except Exception as exc:  # noqa: BLE001
        print(f"user_jobs update skipped ({step}/{status}): {exc}")


def ensure_translate_jobs(sb: Any, user_ids: list[str], detail: str) -> None:
    if not user_ids:
        return
    rows = [
        {
            "user_id": uid,
            "step": "translate",
            "status": "running",
            "title": "翻译匹配新闻",
            "detail": detail,
            "updated_at": _now(),
        }
        for uid in sorted(set(user_ids))
    ]
    try:
        sb.table("user_jobs").insert(rows).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"user_jobs translate insert skipped: {exc}")
