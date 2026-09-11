from datetime import datetime, timezone
import unittest

from cleanup_retention import cutoff_for, is_local_midnight_run


class RetentionScheduleTests(unittest.TestCase):
    def test_winter_midnight(self) -> None:
        now = datetime(2026, 1, 10, 23, 7, tzinfo=timezone.utc)
        self.assertTrue(is_local_midnight_run(now, "Europe/Budapest"))

    def test_summer_midnight(self) -> None:
        now = datetime(2026, 7, 10, 22, 7, tzinfo=timezone.utc)
        self.assertTrue(is_local_midnight_run(now, "Europe/Budapest"))

    def test_other_candidate_is_skipped(self) -> None:
        winter_early = datetime(2026, 1, 10, 22, 7, tzinfo=timezone.utc)
        summer_late = datetime(2026, 7, 10, 23, 7, tzinfo=timezone.utc)
        self.assertFalse(is_local_midnight_run(winter_early, "Europe/Budapest"))
        self.assertFalse(is_local_midnight_run(summer_late, "Europe/Budapest"))

    def test_cutoff_is_twenty_days_in_utc(self) -> None:
        now = datetime(2026, 9, 10, 22, 7, tzinfo=timezone.utc)
        self.assertEqual(
            cutoff_for(now, 20),
            datetime(2026, 8, 21, 22, 7, tzinfo=timezone.utc),
        )


if __name__ == "__main__":
    unittest.main()
