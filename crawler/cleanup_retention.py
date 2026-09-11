"""Delete articles older than the retention window while preserving favorites."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

DEFAULT_RETENTION_DAYS = 20
DEFAULT_TIMEZONE = "Europe/Budapest"
DEFAULT_BATCH_SIZE = 500
MAX_BATCHES = 500


def cutoff_for(now: datetime, retention_days: int) -> datetime:
    return now.astimezone(timezone.utc) - timedelta(days=retention_days)


def is_local_midnight_run(now: datetime, timezone_name: str) -> bool:
    """Two UTC schedules cover CET/CEST; only the local-midnight one may run."""
    local = now.astimezone(ZoneInfo(timezone_name))
    return local.hour == 0


def get_supabase() -> Any:
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        raise SystemExit(1)
    return create_client(url, key)


def purge(sb: Any, *, cutoff: datetime, batch_size: int) -> int:
    total = 0
    for _ in range(MAX_BATCHES):
        result = sb.rpc(
            "purge_old_unstarred_articles",
            {
                "p_cutoff": cutoff.isoformat(),
                "p_batch_size": batch_size,
            },
        ).execute()
        deleted = int(result.data or 0)
        total += deleted
        print(f"Retention cleanup batch: deleted={deleted} total={total}")
        if deleted < batch_size:
            return total
    raise RuntimeError("Retention cleanup reached the safety batch limit")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scheduled", action="store_true")
    parser.add_argument(
        "--retention-days",
        type=int,
        default=int(os.environ.get("ARTICLE_RETENTION_DAYS", DEFAULT_RETENTION_DAYS)),
    )
    parser.add_argument(
        "--timezone",
        default=os.environ.get("RETENTION_TIMEZONE", DEFAULT_TIMEZONE),
    )
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    args = parser.parse_args()

    if args.retention_days < 1:
        parser.error("--retention-days must be at least 1")
    if not 1 <= args.batch_size <= 2000:
        parser.error("--batch-size must be between 1 and 2000")

    now = datetime.now(timezone.utc)
    if args.scheduled and not is_local_midnight_run(now, args.timezone):
        local = now.astimezone(ZoneInfo(args.timezone))
        print(f"Skip cleanup: local time is {local.isoformat()}")
        return 0

    cutoff = cutoff_for(now, args.retention_days)
    deleted = purge(get_supabase(), cutoff=cutoff, batch_size=args.batch_size)
    print(
        f"Retention cleanup complete: deleted={deleted} "
        f"cutoff={cutoff.isoformat()} starred=preserved"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
