from datetime import UTC
from unittest.mock import AsyncMock

from src.pacing import PacingConfig, PacingController, TokenBucket


class TestPacingConfig:
    def test_initial_budget(self):
        c = PacingConfig(warmup_days=14, initial_daily_budget=50)
        assert c.daily_budget_for_day(0) == 50
    def test_budget_increases(self):
        c = PacingConfig(warmup_days=14, initial_daily_budget=50)
        assert c.daily_budget_for_day(7) > c.daily_budget_for_day(0)
        assert c.daily_budget_for_day(14) >= c.daily_budget_for_day(7)
    def test_full_budget(self):
        c = PacingConfig(warmup_days=14, initial_daily_budget=50)
        mx = c.max_daily_likes + c.max_daily_follows + c.max_daily_unfollows + c.max_daily_story_views + c.max_daily_comments
        assert c.daily_budget_for_day(20) >= mx * 0.9

class TestActiveHoursOverride:
    def test_none_or_empty_override_is_a_noop(self):
        c = PacingConfig(active_start_hour=9, active_end_hour=22)
        assert c.with_active_hours_override(None) is c
        assert c.with_active_hours_override({}) is c

    def test_full_override_replaces_both_hours(self):
        c = PacingConfig(active_start_hour=9, active_end_hour=22)
        overridden = c.with_active_hours_override({"start_hour": 6, "end_hour": 20})
        assert overridden.active_start_hour == 6
        assert overridden.active_end_hour == 20
        # original config is untouched — this is a per-account copy, not a mutation
        assert c.active_start_hour == 9
        assert c.active_end_hour == 22

    def test_partial_override_keeps_the_other_bound(self):
        c = PacingConfig(active_start_hour=9, active_end_hour=22)
        overridden = c.with_active_hours_override({"start_hour": 6})
        assert overridden.active_start_hour == 6
        assert overridden.active_end_hour == 22

    def test_override_does_not_affect_other_fields(self):
        c = PacingConfig(warmup_days=14, initial_daily_budget=50, active_start_hour=9, active_end_hour=22)
        overridden = c.with_active_hours_override({"start_hour": 0, "end_hour": 24})
        assert overridden.warmup_days == 14
        assert overridden.initial_daily_budget == 50


class TestDailyLimitsOverride:
    def test_none_or_empty_override_is_a_noop(self):
        c = PacingConfig(max_daily_likes=300, max_daily_follows=150)
        assert c.with_daily_limits_override(None) is c
        assert c.with_daily_limits_override({}) is c

    def test_full_override_replaces_all_five_limits(self):
        c = PacingConfig(
            max_daily_likes=300, max_daily_follows=150, max_daily_unfollows=150,
            max_daily_story_views=500, max_daily_comments=50,
        )
        overridden = c.with_daily_limits_override({
            "daily_like_limit": 200, "daily_follow_limit": 100, "daily_unfollow_limit": 100,
            "daily_story_view_limit": 400, "daily_comment_limit": 0,
        })
        assert overridden.max_daily_likes == 200
        assert overridden.max_daily_follows == 100
        assert overridden.max_daily_unfollows == 100
        assert overridden.max_daily_story_views == 400
        assert overridden.max_daily_comments == 0
        # original config is untouched — a per-account copy, not a mutation
        assert c.max_daily_likes == 300

    def test_partial_override_keeps_other_limits(self):
        c = PacingConfig(max_daily_likes=300, max_daily_follows=150)
        overridden = c.with_daily_limits_override({"daily_like_limit": 50})
        assert overridden.max_daily_likes == 50
        assert overridden.max_daily_follows == 150

    def test_zero_is_a_real_override_not_treated_as_missing(self):
        # daily_comment_limit=0 (TargetingConfig's own default) means
        # "disable commenting" — must not be confused with "not provided".
        c = PacingConfig(max_daily_comments=50)
        overridden = c.with_daily_limits_override({"daily_comment_limit": 0})
        assert overridden.max_daily_comments == 0

    def test_override_does_not_affect_unrelated_fields(self):
        c = PacingConfig(warmup_days=14, active_start_hour=9, max_daily_likes=300)
        overridden = c.with_daily_limits_override({"daily_like_limit": 50})
        assert overridden.warmup_days == 14
        assert overridden.active_start_hour == 9

class TestPacingController:
    def _make(self, phase="warmup", day=0):
        mr = AsyncMock()
        mr.hgetall = AsyncMock(return_value={})
        mr.eval = AsyncMock(return_value=1)
        c = PacingConfig(warmup_days=14, initial_daily_budget=50)
        return PacingController(redis_client=mr, account_id="test", config=c, phase=phase, warmup_day=day), mr

    def test_initial_state(self):
        ctrl, _ = self._make()
        assert ctrl.phase == "warmup"
        assert ctrl.warmup_day == 0
        assert ctrl.consecutive_blocks == 0
        assert not ctrl.is_throttled

    def test_active_hours_bool(self):
        ctrl, _ = self._make()
        assert isinstance(ctrl.is_active_hours, bool)

    def test_active_hours_override_actually_changes_controller_behavior(self):
        from unittest.mock import AsyncMock

        mr = AsyncMock()
        mr.hgetall = AsyncMock(return_value={})
        mr.eval = AsyncMock(return_value=1)
        # a 0-24 window is always active regardless of the real wall-clock
        # hour — proves the per-account override actually reaches the
        # controller, not just PacingConfig in isolation.
        base = PacingConfig(warmup_days=14, initial_daily_budget=50, active_start_hour=9, active_end_hour=10)
        overridden = base.with_active_hours_override({"start_hour": 0, "end_hour": 24})
        ctrl = PacingController(redis_client=mr, account_id="test", config=overridden)
        assert ctrl.is_active_hours is True

    def test_record_block(self):
        ctrl, _ = self._make()
        assert ctrl.consecutive_blocks == 0
        ctrl.record_block("soft")
        assert ctrl.consecutive_blocks == 1
        assert ctrl.last_block_at is not None

    def test_hard_block(self):
        ctrl, _ = self._make()
        ctrl.record_block("hard")
        assert ctrl.consecutive_blocks == 2
        assert ctrl.phase == "throttled"

    def test_max_blocks_throttle(self):
        ctrl, _ = self._make()
        ctrl.config.max_consecutive_blocks = 3
        ctrl.config.block_cooldown_minutes = 0
        ctrl.record_block("soft"); ctrl.record_block("soft")
        assert not ctrl.is_throttled
        ctrl.record_block("soft")
        assert ctrl.is_throttled
        assert ctrl.phase == "throttled"

    def test_risk_score_increases(self):
        ctrl, _ = self._make()
        s1 = ctrl.risk_score()
        ctrl.record_block("soft"); s2 = ctrl.risk_score()
        ctrl.record_block("hard"); s3 = ctrl.risk_score()
        assert s2 >= s1; assert s3 >= s2
        assert 0 <= s3 <= 100

    def test_advance_warmup(self):
        ctrl, _ = self._make()
        ctrl.advance_warmup()
        assert ctrl.warmup_day == 1
        for _ in range(14): ctrl.advance_warmup()
        assert ctrl.phase == "steady"

    def test_advance_day_if_needed_baseline_does_not_advance(self):
        from datetime import datetime
        ctrl, _ = self._make()
        advanced = ctrl.advance_day_if_needed(now=datetime(2026, 1, 1, tzinfo=UTC))
        assert advanced is False
        assert ctrl.warmup_day == 0

    def test_advance_day_if_needed_same_day_is_a_noop(self):
        from datetime import datetime
        ctrl, _ = self._make()
        ctrl.advance_day_if_needed(now=datetime(2026, 1, 1, 8, tzinfo=UTC))
        advanced = ctrl.advance_day_if_needed(now=datetime(2026, 1, 1, 20, tzinfo=UTC))
        assert advanced is False
        assert ctrl.warmup_day == 0

    def test_advance_day_if_needed_advances_once_per_new_day(self):
        from datetime import datetime
        ctrl, _ = self._make()
        ctrl.advance_day_if_needed(now=datetime(2026, 1, 1, tzinfo=UTC))
        advanced = ctrl.advance_day_if_needed(now=datetime(2026, 1, 2, tzinfo=UTC))
        assert advanced is True
        assert ctrl.warmup_day == 1

    def test_advance_day_if_needed_catches_up_missed_days(self):
        from datetime import datetime
        ctrl, _ = self._make()
        ctrl.advance_day_if_needed(now=datetime(2026, 1, 1, tzinfo=UTC))
        # worker was "down" for 4 days — catch up, don't skip ahead
        advanced = ctrl.advance_day_if_needed(now=datetime(2026, 1, 5, tzinfo=UTC))
        assert advanced is True
        assert ctrl.warmup_day == 4

    def test_delay_positive(self):
        ctrl, _ = self._make()
        d = ctrl.next_action_delay()
        assert d > 0 and isinstance(d, float)

class TestTokenBucket:
    def test_consume_success(self):
        mr = AsyncMock(); mr.eval = AsyncMock(return_value=1)
        b = TokenBucket(redis_client=mr, account_id="t", action_type="like", max_tokens=100, refill_per_hour=10)
        import asyncio
        assert asyncio.run(b.try_consume(1)) is True
