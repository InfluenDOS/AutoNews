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


def ensure_jobs(
    sb: Any,
    *,
    user_ids: list[str],
    step: str,
    status: str,
    title: str,
    detail: str = "",
) -> None:
    """Insert jobs only for users who do not already have an active row for this step."""
    if not user_ids:
        return
    unique = sorted(set(user_ids))
    active: set[str] = set()
    try:
        rows = (
            sb.table("user_jobs")
            .select("user_id")
            .eq("step", step)
            .in_("status", ["queued", "running"])
            .in_("user_id", unique)
            .execute()
            .data
            or []
        )
        active = {r["user_id"] for r in rows if r.get("user_id")}
    except Exception as exc:  # noqa: BLE001
        print(f"user_jobs active lookup skipped ({step}): {exc}")

    missing = [uid for uid in unique if uid not in active]
    if not missing:
        return
    payload = [
        {
            "user_id": uid,
            "step": step,
            "status": status,
            "title": title,
            "detail": detail,
            "updated_at": _now(),
        }
        for uid in missing
    ]
    try:
        sb.table("user_jobs").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"user_jobs insert skipped ({step}): {exc}")


def ensure_translate_jobs(sb: Any, user_ids: list[str], detail: str) -> None:
    ensure_jobs(
        sb,
        user_ids=user_ids,
        step="translate",
        status="running",
        title="翻译匹配新闻",
        detail=detail,
    )
