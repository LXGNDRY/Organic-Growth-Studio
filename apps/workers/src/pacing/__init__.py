"""Pacing controller — the safety moat of the engagement engine.

Principles:
1. Every action must acquire a token from the pacing bucket first.
2. No code path can bypass the token check.
3. On any Instagram block signal, the controller immediately backs off.
4. New accounts go through a mandatory warm-up period.
"""
from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from typing import Literal, Optional

Phase = Literal["warmup", "ramping", "steady", "throttled"]
ActionType = Literal["like", "follow", "unfollow", "story_view", "comment"]

@dataclass
class PacingConfig:
    warmup_days: int = 14
    initial_daily_budget: int = 50
    max_daily_likes: int = 300
    max_daily_follows: int = 150
    max_daily_unfollows: int = 150
    max_daily_story_views: int = 500
    max_daily_comments: int = 50
    active_start_hour: int = 9
    active_end_hour: int = 22
    timezone: str = "UTC"
    max_consecutive_blocks: int = 3
    block_cooldown_minutes: int = 60

    def daily_budget_for_day(self, warmup_day: int) -> int:
        if warmup_day <= 0: return self.initial_daily_budget
        max_total = self.max_daily_likes + self.max_daily_follows + self.max_daily_unfollows + self.max_daily_story_views + self.max_daily_comments
        progress = min(warmup_day / self.warmup_days, 1.0)
        k = 8.0; midpoint = 0.4
        sigmoid = 1.0 / (1.0 + math.exp(-k * (progress - midpoint)))
        budget = self.initial_daily_budget + (max_total - self.initial_daily_budget) * sigmoid
        return int(budget)

class TokenBucket:
    """Redis-backed token bucket for rate limiting (one per account/action/day)."""
    def __init__(self, redis_client, account_id: str, action_type: ActionType, max_tokens: int, refill_per_hour: float):
        self.redis = redis_client
        self.account_id = account_id
        self.action_type = action_type
        self.max_tokens = max_tokens
        self.refill_per_hour = refill_per_hour
        self._key = f"pacing:bucket:{account_id}:{action_type}:{datetime.now(UTC).strftime('%Y%m%d')}"

    async def available(self) -> int:
        data = await self.redis.hgetall(self._key)
        if not data: return self.max_tokens
        tokens = float(data.get(b"tokens", self.max_tokens))
        last_refill = float(data.get(b"last_refill", time.time()))
        elapsed = (time.time() - last_refill) / 3600.0
        return int(min(tokens + elapsed * self.refill_per_hour, self.max_tokens))

    async def try_consume(self, tokens: int = 1) -> bool:
        lua = """
        local key = KEYS[1]
        local need = tonumber(ARGV[1])
        local max = tonumber(ARGV[2])
        local refill = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])
        local current = max
        local last = now
        local data = redis.call('HGETALL', key)
        if #data > 0 then
            for i = 1, #data, 2 do
                if data[i] == 'tokens' then current = tonumber(data[i+1]) end
                if data[i] == 'last_refill' then last = tonumber(data[i+1]) end
            end
        end
        current = math.min(current + (now - last) / 3600 * refill, max)
        if current >= need then
            redis.call('HSET', key, 'tokens', current - need, 'last_refill', now)
            return 1
        else return 0 end
        """
        result = await self.redis.eval(lua, 1, self._key, str(tokens), str(self.max_tokens), str(self.refill_per_hour), str(time.time()))
        return bool(result)

class PacingController:
    """Manages pacing for a single Instagram account."""
    def __init__(self, redis_client, account_id: str, config: PacingConfig, phase: Phase = "warmup", warmup_day: int = 0, consecutive_blocks: int = 0, last_block_at: datetime | None = None):
        self.redis = redis_client
        self.account_id = account_id
        self.config = config
        self.phase: Phase = phase
        self.warmup_day = warmup_day
        self.consecutive_blocks = consecutive_blocks
        self.last_block_at = last_block_at
        self._buckets: dict[ActionType, TokenBucket] = {}
        self._init_buckets()

    def _init_buckets(self) -> None:
        budget = self.config.daily_budget_for_day(self.warmup_day)
        active_hours = max(self.config.active_end_hour - self.config.active_start_hour, 1)
        dist: dict[ActionType, float] = {"like": 0.40, "follow": 0.25, "unfollow": 0.20, "story_view": 0.10, "comment": 0.05}
        max_per: dict[ActionType, int] = {"like": self.config.max_daily_likes, "follow": self.config.max_daily_follows, "unfollow": self.config.max_daily_unfollows, "story_view": self.config.max_daily_story_views, "comment": self.config.max_daily_comments}
        for at, ratio in dist.items():
            size = min(int(budget * ratio), max_per[at])
            if size < 1: size = 1
            self._buckets[at] = TokenBucket(self.redis, self.account_id, at, max_tokens=size, refill_per_hour=size / active_hours)

    @property
    def is_throttled(self) -> bool:
        if self.consecutive_blocks >= self.config.max_consecutive_blocks: return True
        if self.last_block_at:
            cooldown_end = self.last_block_at + timedelta(minutes=self.config.block_cooldown_minutes * (2 ** self.consecutive_blocks))
            return datetime.now(UTC) < cooldown_end
        return False

    @property
    def is_active_hours(self) -> bool:
        h = datetime.now(UTC).hour
        if self.config.active_start_hour <= self.config.active_end_hour:
            return self.config.active_start_hour <= h < self.config.active_end_hour
        else:
            return h >= self.config.active_start_hour or h < self.config.active_end_hour

    def risk_score(self) -> int:
        score = 0
        score += min(self.consecutive_blocks * 17, 50)
        phases = {"warmup": 5, "ramping": 15, "steady": 10, "throttled": 30}
        score += phases.get(self.phase, 10)
        if self.warmup_day < 3: score += 5
        elif self.warmup_day < 7: score += 15
        else: score += 25
        return min(score, 100)

    def next_action_delay(self) -> float:
        if not self.is_active_hours: return random.uniform(600, 1800)
        budget = self.config.daily_budget_for_day(self.warmup_day)
        active_hours = max(self.config.active_end_hour - self.config.active_start_hour, 1)
        per_hour = budget / active_hours
        base = 3600.0 / max(per_hour, 1)
        factor = random.lognormvariate(0, 0.7)
        factor = max(0.3, min(factor, 4.0))
        return base * factor

    async def can_perform(self, action_type: ActionType) -> bool:
        if self.is_throttled: return False
        if not self.is_active_hours: return False
        b = self._buckets.get(action_type)
        return bool(b and await b.available() > 0)

    async def consume_token(self, action_type: ActionType) -> bool:
        if self.is_throttled: return False
        if not self.is_active_hours: return False
        b = self._buckets.get(action_type)
        if not b: return False
        return await b.try_consume(1)

    def record_block(self, severity: str = "soft") -> None:
        self.consecutive_blocks += 1
        self.last_block_at = datetime.now(UTC)
        if severity == "hard":
            self.consecutive_blocks += 1
            self.phase = "throttled"
        if self.consecutive_blocks >= self.config.max_consecutive_blocks:
            self.phase = "throttled"

    def record_success(self) -> None:
        """A clean action is evidence the account is not currently flagged.

        Consecutive blocks decay by one per success (never below zero), and a
        full recovery clears the throttled phase back to whatever the warmup
        schedule says it should be. This must stay strictly slower than
        `record_block`'s increment so a block is never "cancelled out" by a
        single lucky action.
        """
        if self.consecutive_blocks > 0:
            self.consecutive_blocks -= 1
        if self.consecutive_blocks == 0 and self.phase == "throttled":
            if self.warmup_day < 3:
                self.phase = "warmup"
            elif self.warmup_day < self.config.warmup_days:
                self.phase = "ramping"
            else:
                self.phase = "steady"

    def advance_warmup(self) -> None:
        self.warmup_day += 1
        if self.warmup_day < 3: self.phase = "warmup"
        elif self.warmup_day < self.config.warmup_days: self.phase = "ramping"
        else: self.phase = "steady"
        self._init_buckets()
