from unittest.mock import AsyncMock

import pytest

from src.discovery import DiscoveredAccount, TargetDiscoveryService, TargetSource
from src.engine import EngagementEngine
from src.execution import ActionExecutor, ActionType
from src.pacing import PacingConfig, PacingController

pytestmark = pytest.mark.asyncio


def make_account(username: str, followers: int, following: int, posts: int, private: bool = False) -> DiscoveredAccount:
    return DiscoveredAccount(
        username=username, instagram_id=f"ig_{username}", source=TargetSource.HASHTAG_ENGAGERS,
        source_ref="#test", follower_count=followers, following_count=following,
        post_count=posts, is_private=private,
    )


class StubDiscovery(TargetDiscoveryService):
    def __init__(self, candidates):
        super().__init__()
        self._candidates = candidates

    async def discover(self, account_id, targeting_config, max_candidates=1000):
        return self._candidates[:max_candidates]


def make_pacing(**overrides):
    mr = AsyncMock()
    mr.hgetall = AsyncMock(return_value={})
    mr.eval = AsyncMock(return_value=1)
    defaults = {"warmup_days": 14, "initial_daily_budget": 50}
    defaults.update(overrides)
    cfg = PacingConfig(**defaults)
    return PacingController(redis_client=mr, account_id="acct-e2e", config=cfg), mr


class TestEngineWiring:
    async def test_low_quality_targets_are_skipped_and_never_execute(self):
        candidates = [make_account("bot1", followers=10, following=9000, posts=0, private=False)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates))

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert cycle.discovered == 1
        assert cycle.skipped_low_quality == 1
        assert cycle.actions_attempted == 0

    async def test_high_quality_target_gets_engaged(self):
        candidates = [make_account("good1", followers=5000, following=800, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates))

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert cycle.actions_attempted > 0
        assert len(cycle.executed) == cycle.actions_attempted

    async def test_throttled_account_runs_zero_actions(self):
        candidates = [make_account("good1", followers=5000, following=800, posts=120)]
        pacing, mr = make_pacing(max_consecutive_blocks=1)
        pacing.record_block("hard")
        assert pacing.is_throttled
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates))

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert cycle.throttled is True
        assert cycle.actions_attempted == 0
        assert cycle.executed == []

    async def test_exhausting_budget_stops_further_actions(self):
        candidates = [make_account(f"acct{i}", followers=5000, following=800, posts=120) for i in range(20)]
        pacing, mr = make_pacing(initial_daily_budget=2)
        # deplete tokens deterministically via the mocked redis eval: allow exactly N, then deny
        calls = {"n": 0}

        async def eval_side_effect(*args, **kwargs):
            calls["n"] += 1
            return 1 if calls["n"] <= 2 else 0

        mr.eval.side_effect = eval_side_effect
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates))

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000}, action_types=[ActionType.LIKE])

        assert cycle.actions_completed + cycle.actions_blocked <= 2

    async def test_on_result_feedback_hook_is_called_for_every_execution(self):
        candidates = [make_account("good1", followers=5000, following=800, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        seen = []

        async def sink(executed):
            seen.append(executed)

        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), on_result=sink)
        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert len(seen) == len(cycle.executed)
        assert len(seen) > 0
