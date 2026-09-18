from unittest.mock import AsyncMock

import pytest

from src.discovery import DiscoveredAccount, TargetDiscoveryService, TargetSource
from src.engine import EngagementEngine
from src.execution import ActionExecutor, ActionStatus, ActionType, ExecutionResult
from src.pacing import PacingConfig, PacingController

pytestmark = pytest.mark.asyncio


async def no_delay(seconds: float) -> None:
    """Test double for EngagementEngine's inter-action delay — instant."""


class AlwaysSucceedClient:
    """Deterministic test double for tests asserting an exact action count,
    where SimulatedInstagramClient's randomized success rate would flake.
    """

    async def _ok(self, *args, **kwargs):
        return ExecutionResult(success=True, status=ActionStatus.COMPLETED, http_status=200)

    like = follow = unfollow = story_view = comment = _ok


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
    # active_start_hour/active_end_hour span the full day so these tests
    # don't flake depending on the real wall-clock hour they happen to run at.
    defaults = {"warmup_days": 14, "initial_daily_budget": 50, "active_start_hour": 0, "active_end_hour": 24}
    defaults.update(overrides)
    cfg = PacingConfig(**defaults)
    return PacingController(redis_client=mr, account_id="acct-e2e", config=cfg), mr


class TestTargetingConfigReachesTheEngine:
    async def test_skip_business_accounts_excludes_the_candidate_end_to_end(self):
        candidates = [make_account("biz1", followers=5000, following=1200, posts=120)]
        candidates[0].is_business = True
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "skip_business_accounts": True}
        )

        # filter_by_criteria runs before `discovered`/`scored` are counted,
        # so a business account excluded by the targeting config never
        # shows up in either — and certainly never gets acted on.
        assert cycle.discovered == 0
        assert cycle.scored == 0
        assert cycle.actions_attempted == 0

    async def test_blacklisted_username_excludes_the_candidate_end_to_end(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "blacklisted_usernames": ["good1"]}
        )

        assert cycle.discovered == 0
        assert cycle.scored == 0
        assert cycle.actions_attempted == 0

    async def test_max_following_excludes_the_candidate_end_to_end(self):
        candidates = [make_account("massfollower", followers=5000, following=999999, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "max_following": 10000}
        )

        assert cycle.discovered == 0
        assert cycle.actions_attempted == 0

    async def test_min_posts_excludes_the_candidate_end_to_end(self):
        candidates = [make_account("emptyprofile", followers=5000, following=1200, posts=0)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "min_posts": 3}
        )

        assert cycle.discovered == 0
        assert cycle.actions_attempted == 0

    async def test_follow_back_ratio_excludes_the_candidate_end_to_end(self):
        candidates = [make_account("lopsided", followers=50000, following=100, posts=120)]  # ratio 500
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "follow_back_ratio_max": 5.0}
        )

        assert cycle.discovered == 0
        assert cycle.actions_attempted == 0

    async def test_gender_filter_excludes_the_candidate_end_to_end(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        candidates[0].gender = "male"
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "gender": "female"}
        )

        assert cycle.discovered == 0
        assert cycle.actions_attempted == 0

    async def test_languages_filter_excludes_the_candidate_end_to_end(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        candidates[0].language = "fr"
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "languages": ["en"]}
        )

        assert cycle.discovered == 0
        assert cycle.actions_attempted == 0


class TestEngineWiring:
    async def test_low_quality_targets_are_skipped_and_never_execute(self):
        # posts=5 (not 0) and following=200 (not e.g. 9000) so this clears
        # the min_posts and follow_back_ratio discovery filters and actually
        # reaches scoring — the poor ratio, tiny post count, and young
        # account age still score it low enough to hit MIN_QUALITY_SCORE.
        candidates = [make_account("bot1", followers=50, following=200, posts=5, private=False)]
        candidates[0].account_age_days = 10
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert cycle.discovered == 1
        assert cycle.skipped_low_quality == 1
        assert cycle.actions_attempted == 0

    async def test_high_quality_target_gets_engaged(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert cycle.actions_attempted > 0
        assert len(cycle.executed) == cycle.actions_attempted

    async def test_throttled_account_runs_zero_actions(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing(max_consecutive_blocks=1)
        pacing.record_block("hard")
        assert pacing.is_throttled
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert cycle.throttled is True
        assert cycle.actions_attempted == 0
        assert cycle.executed == []

    async def test_exhausting_budget_stops_further_actions(self):
        candidates = [make_account(f"acct{i}", followers=5000, following=1200, posts=120) for i in range(20)]
        pacing, mr = make_pacing(initial_daily_budget=2)
        # deplete tokens deterministically via the mocked redis eval: allow exactly N, then deny
        calls = {"n": 0}

        async def eval_side_effect(*args, **kwargs):
            calls["n"] += 1
            return 1 if calls["n"] <= 2 else 0

        mr.eval.side_effect = eval_side_effect
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000}, action_types=[ActionType.LIKE])

        assert cycle.actions_completed + cycle.actions_blocked <= 2

    async def test_delay_fn_is_called_between_actions(self):
        candidates = [make_account(f"acct{i}", followers=5000, following=1200, posts=120) for i in range(3)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        delays = []

        async def recording_delay(seconds):
            delays.append(seconds)

        engine = EngagementEngine(
            "acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=recording_delay,
        )
        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert len(delays) == len(cycle.executed) > 0
        assert all(d > 0 for d in delays)

    async def test_unsupported_action_type_rejected_before_token_consumed(self, monkeypatch):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        # All ActionType values are supported today — simulate a
        # not-yet-implemented one to prove the rejection still happens
        # before any token is consumed, rather than relying on an action
        # type that is always excluded.
        monkeypatch.setattr("src.engine.SUPPORTED_ACTION_TYPES", {ActionType.LIKE, ActionType.FOLLOW})

        with pytest.raises(NotImplementedError):
            await engine._execute_one(engine._score(candidates[0]), ActionType.UNFOLLOW)

        # the Lua eval (token consumption) must never have been called
        mr.eval.assert_not_called()

    async def test_story_view_and_comment_execute_end_to_end(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e", client=AlwaysSucceedClient(), dry_run=False)
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "enabled_actions": ["story_view", "comment"]}
        )

        assert cycle.actions_attempted > 0
        assert {e.action_type for e in cycle.executed} <= {"story_view", "comment"}

    async def test_transport_exception_is_recorded_not_raised(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing()

        class ExplodingClient:
            async def like(self, target_id, media_id, proxy_url=None):
                raise ConnectionError("boom")

            async def follow(self, target_id, target_username, proxy_url=None):
                raise ConnectionError("boom")

        executor = ActionExecutor(account_id="acct-e2e", client=ExplodingClient(), dry_run=False)
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert cycle.actions_attempted > 0
        assert all(not e.result.success for e in cycle.executed)
        assert all(e.result.error_code == "transport_error" for e in cycle.executed)

    async def test_on_result_feedback_hook_is_called_for_every_execution(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        seen = []

        async def sink(executed):
            seen.append(executed)

        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), on_result=sink, delay_fn=no_delay)
        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})

        assert len(seen) == len(cycle.executed)
        assert len(seen) > 0


class TestUnfollowCycle:
    async def test_unfollows_every_stale_target_when_budget_allows(self):
        pacing, mr = make_pacing()
        # A deterministic client, not the random simulator: this test
        # asserts an exact attempted count, and the simulator's 5% failure
        # rate can trigger a real block mid-loop (correctly halting further
        # attempts) often enough to flake a 3-target run.
        executor = ActionExecutor(account_id="acct-e2e", client=AlwaysSucceedClient(), dry_run=False)
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery([]), delay_fn=no_delay)

        stale = [("ig_1", "user1"), ("ig_2", "user2"), ("ig_3", "user3")]
        cycle = await engine.run_unfollow_cycle(stale)

        assert cycle.actions_attempted == 3
        assert len(cycle.executed) == 3
        assert all(e.action_type == "unfollow" for e in cycle.executed)
        assert {e.target_instagram_id for e in cycle.executed} == {"ig_1", "ig_2", "ig_3"}

    async def test_unfollow_cycle_is_pacing_gated(self):
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery([]), delay_fn=no_delay)

        # simulate an exhausted unfollow bucket: can_perform false after first
        calls = {"n": 0}

        async def can_perform_side_effect(action_type):
            calls["n"] += 1
            return calls["n"] <= 1

        pacing.can_perform = can_perform_side_effect
        stale = [("ig_1", "user1"), ("ig_2", "user2")]
        cycle = await engine.run_unfollow_cycle(stale)

        # the first target is allowed and attempted; the second is skipped
        # by can_perform before an attempt is even counted.
        assert cycle.actions_attempted == 1
        assert len(cycle.executed) == 1

    async def test_throttled_account_unfollows_nothing(self):
        pacing, mr = make_pacing(max_consecutive_blocks=1)
        pacing.record_block("hard")
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery([]), delay_fn=no_delay)

        cycle = await engine.run_unfollow_cycle([("ig_1", "user1")])

        assert cycle.throttled is True
        assert cycle.executed == []

    async def test_unfollow_cycle_never_bypasses_pacing_token(self):
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery([]), delay_fn=no_delay)

        await engine.run_unfollow_cycle([("ig_1", "user1")])

        # the Lua eval (token consumption) must have been invoked — same
        # enforcement point as run_cycle, not a separate ungated path.
        mr.eval.assert_called()


class TestEnabledActionsGate:
    async def test_defaults_to_like_and_follow_when_unset(self):
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor)

        resolved = engine._resolve_action_types({})

        assert resolved == [ActionType.LIKE, ActionType.FOLLOW]

    async def test_disabling_follow_actually_disables_it_end_to_end(self):
        candidates = [make_account("good1", followers=5000, following=1200, posts=120)]
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery(candidates), delay_fn=no_delay)

        cycle = await engine.run_cycle(
            targeting_config={"min_followers": 0, "max_followers": 100000, "enabled_actions": ["like"]}
        )

        assert cycle.actions_attempted > 0
        assert all(e.action_type == "like" for e in cycle.executed)

    async def test_unknown_action_name_is_dropped_not_raised(self):
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor)

        resolved = engine._resolve_action_types({"enabled_actions": ["like", "nonsense"]})

        assert resolved == [ActionType.LIKE]

    async def test_comment_is_a_supported_resolved_action(self):
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor)

        resolved = engine._resolve_action_types({"enabled_actions": ["comment", "follow"]})

        assert resolved == [ActionType.COMMENT, ActionType.FOLLOW]

    async def test_not_yet_supported_action_is_dropped_not_raised(self, monkeypatch):
        monkeypatch.setattr("src.engine.SUPPORTED_ACTION_TYPES", {ActionType.LIKE, ActionType.FOLLOW})
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor)

        resolved = engine._resolve_action_types({"enabled_actions": ["comment", "follow"]})

        assert resolved == [ActionType.FOLLOW]

    async def test_explicit_action_types_param_overrides_config(self):
        pacing, mr = make_pacing()
        executor = ActionExecutor(account_id="acct-e2e")
        engine = EngagementEngine("acct-e2e", pacing, executor, discovery=StubDiscovery([]), delay_fn=no_delay)

        # an explicit action_types= argument (as tests elsewhere pass) must
        # still win over whatever the targeting config says.
        cycle = await engine.run_cycle(
            targeting_config={"enabled_actions": ["like"]}, action_types=[ActionType.UNFOLLOW],
        )
        assert cycle.discovered == 0  # nothing to act on either way; just confirms no crash on override path
