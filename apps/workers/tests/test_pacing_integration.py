"""Integration tests against a real Redis instance (no mocks).

These exercise the actual Lua token-bucket script, which is exactly the
part a mocked redis client cannot validate honestly.
"""
import pytest

from src.pacing import PacingConfig, PacingController, TokenBucket

pytestmark = pytest.mark.asyncio


async def test_token_bucket_consumes_and_depletes(real_redis):
    bucket = TokenBucket(real_redis, account_id="acct-1", action_type="like", max_tokens=3, refill_per_hour=0)
    assert await bucket.try_consume(1) is True
    assert await bucket.try_consume(1) is True
    assert await bucket.try_consume(1) is True
    # bucket is now empty; a 4th consume must fail — this is the safety invariant
    assert await bucket.try_consume(1) is False


async def test_token_bucket_refills_over_time(real_redis):
    bucket = TokenBucket(real_redis, account_id="acct-2", action_type="like", max_tokens=10, refill_per_hour=36000)
    for _ in range(10):
        assert await bucket.try_consume(1) is True
    assert await bucket.try_consume(1) is False
    import asyncio
    await asyncio.sleep(0.5)
    assert await bucket.try_consume(1) is True


async def test_token_bucket_is_scoped_per_account_and_action(real_redis):
    a = TokenBucket(real_redis, account_id="acct-3", action_type="like", max_tokens=1, refill_per_hour=0)
    b = TokenBucket(real_redis, account_id="acct-4", action_type="like", max_tokens=1, refill_per_hour=0)
    c = TokenBucket(real_redis, account_id="acct-3", action_type="follow", max_tokens=1, refill_per_hour=0)
    assert await a.try_consume(1) is True
    assert await a.try_consume(1) is False
    # a different account or a different action type is an independent bucket
    assert await b.try_consume(1) is True
    assert await c.try_consume(1) is True


async def test_controller_cannot_consume_past_budget(real_redis):
    # active hours span the full day so this doesn't flake depending on the
    # real wall-clock hour it happens to run at.
    cfg = PacingConfig(warmup_days=14, initial_daily_budget=5, active_start_hour=0, active_end_hour=24)
    ctrl = PacingController(redis_client=real_redis, account_id="acct-5", config=cfg)
    consumed = 0
    for _ in range(100):
        if await ctrl.consume_token("like"):
            consumed += 1
        else:
            break
    like_budget = ctrl._buckets["like"].max_tokens
    assert consumed == like_budget


async def test_throttled_controller_never_consumes(real_redis):
    cfg = PacingConfig(warmup_days=14, initial_daily_budget=50, max_consecutive_blocks=1, block_cooldown_minutes=60)
    ctrl = PacingController(redis_client=real_redis, account_id="acct-6", config=cfg)
    ctrl.record_block("hard")
    assert ctrl.is_throttled
    assert await ctrl.consume_token("like") is False
    assert await ctrl.can_perform("like") is False
