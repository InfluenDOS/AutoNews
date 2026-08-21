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
    meta: dict[str, Any] | None = None,
    from_statuses: list[str] | None = None,
) -> None:
    try:
        payload: dict[str, Any] = {
            "status": status,
            "detail": detail,
            "updated_at": _now(),
        }
        if title:
            payload["title"] = title
        if meta is not None:
            payload["meta"] = meta
        q = sb.table("user_jobs").update(payload).eq("step", step)
        if from_statuses:
            q = q.in_("status", from_statuses)
        else:
            q = q.in_("status", ["queued", "running"])
        q.execute()
    except Exception as exc:  # noqa: BLE001
        print(f"user_jobs update skipped ({step}/{status}): {exc}")


def phrase_label(phrases: list[str], *, limit: int = 3) -> str:
    cleaned = [str(p).strip() for p in phrases if str(p).strip()]
    if not cleaned:
        return "关键词"
    if len(cleaned) == 1:
        return f"「{cleaned[0]}」"
    if len(cleaned) <= limit:
        return "、".join(f"「{p}」" for p in cleaned)
    return f"「{cleaned[0]}」等 {len(cleaned)} 个关键词"


def job_title(action: str, phrases: list[str]) -> str:
    return f"{action}{phrase_label(phrases)}"


def ensure_jobs(
    sb: Any,
    *,
    user_ids: list[str],
    step: str,
    status: str,
    title: str,
    detail: str = "",
    keyword_id: str | None = None,
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
            "keyword_id": keyword_id,
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


def ensure_jobs_per_user(
    sb: Any,
    *,
    step: str,
    status: str,
    by_user: dict[str, dict[str, Any]],
) -> None:
    """by_user[uid] = {title, detail, keyword_id?}"""
    if not by_user:
        return
    active: set[str] = set()
    uids = list(by_user.keys())
    try:
        rows = (
            sb.table("user_jobs")
            .select("user_id")
            .eq("step", step)
            .in_("status", ["queued", "running"])
            .in_("user_id", uids)
            .execute()
            .data
            or []
        )
        active = {r["user_id"] for r in rows if r.get("user_id")}
    except Exception as exc:  # noqa: BLE001
        print(f"user_jobs active lookup skipped ({step}): {exc}")

    payload = []
    for uid, meta in by_user.items():
        if uid in active:
            continue
        payload.append(
            {
                "user_id": uid,
                "keyword_id": meta.get("keyword_id"),
                "step": step,
                "status": status,
                "title": meta.get("title") or step,
                "detail": meta.get("detail") or "",
                "updated_at": _now(),
            }
        )
    if not payload:
        return
    try:
        sb.table("user_jobs").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        print(f"user_jobs insert skipped ({step}): {exc}")


def ensure_crawl_jobs(sb: Any, user_keywords: dict[str, list[dict[str, Any]]]) -> None:
    by_user: dict[str, dict[str, Any]] = {}
    for uid, rows in user_keywords.items():
        phrases = [str(r.get("phrase") or "") for r in rows]
        kids = [str(r.get("id") or "") for r in rows if r.get("id")]
        by_user[uid] = {
            "title": job_title("抓取", phrases),
            "detail": f"正在抓取并匹配 {phrase_label(phrases)} …",
            "keyword_id": kids[0] if len(kids) == 1 else None,
        }
    ensure_jobs_per_user(sb, step="crawl", status="running", by_user=by_user)


def ensure_translate_jobs(
    sb: Any,
    user_ids: list[str],
    detail: str,
    phrases_by_user: dict[str, list[str]] | None = None,
) -> None:
    phrases_by_user = phrases_by_user or {}
    by_user: dict[str, dict[str, Any]] = {}
    for uid in user_ids:
        phrases = phrases_by_user.get(uid) or []
        by_user[uid] = {
            "title": job_title("翻译", phrases) if phrases else "翻译匹配新闻",
            "detail": detail if not phrases else f"正在翻译 {phrase_label(phrases)} 的匹配新闻…",
        }
    ensure_jobs_per_user(sb, step="translate", status="running", by_user=by_user)
