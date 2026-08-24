from unittest.mock import AsyncMock
import pytest
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
