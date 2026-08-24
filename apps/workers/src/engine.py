"""The engagement engine — the single entry point that wires
discovery -> scoring -> pacing -> execution -> feedback together.

This module exists so there is exactly one code path capable of executing
an action against a target, and that path cannot skip the pacing check.
Nothing outside `EngagementEngine.run_cycle` is allowed to call
`ActionExecutor` directly in worker code.
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import structlog

from src.discovery import DiscoveredAccount, TargetDiscoveryService
from src.execution import ActionExecutor, ActionStatus, ActionType, ExecutionResult, IGBlockDetector
from src.pacing import PacingController
from src.scoring import AccountProfile, calculate_quality_score, estimate_follow_probability

logger = structlog.get_logger()


@dataclass
class ScoredTarget:
    account: DiscoveredAccount
    quality_score: int
    follow_probability: float


@dataclass
class CycleResult:
    account_id: str
    discovered: int = 0
    scored: int = 0
    skipped_low_quality: int = 0
    actions_attempted: int = 0
    actions_completed: int = 0
    actions_blocked: int = 0
    throttled: bool = False
    executed: list[ExecutedAction] = field(default_factory=list)


@dataclass
class ExecutedAction:
    target_username: str
    action_type: str
    result: ExecutionResult
    quality_score: int


# Below this quality score a target is not worth the pacing budget it would
# consume — better to spend the token on a higher-probability target.
MIN_QUALITY_SCORE = 40

# Actions the executor actually implements. Checked before a token is ever
# consumed, so an unimplemented action type never silently burns budget.
SUPPORTED_ACTION_TYPES = {ActionType.LIKE, ActionType.FOLLOW, ActionType.UNFOLLOW}

FeedbackSink = Callable[[ExecutedAction], Awaitable[None]]
DelayFn = Callable[[float], Awaitable[None]]


class EngagementEngine:
    """Runs one discovery+engagement cycle for a single account.

    `pacing` is required and is consulted before every single action — this
    is the enforcement point for the "no code path can bypass the pacing
    controller" rule. There is no execute-without-a-token method on this
    class; if one is ever added, it violates the safety model.
    """

    def __init__(
        self,
        account_id: str,
        pacing: PacingController,
        executor: ActionExecutor,
        discovery: TargetDiscoveryService | None = None,
        on_result: FeedbackSink | None = None,
        delay_fn: DelayFn | None = None,
    ):
        self.account_id = account_id
        self.pacing = pacing
        self.executor = executor
        self.discovery = discovery or TargetDiscoveryService()
        self.on_result = on_result
        # Pluggable so tests aren't forced to sleep in real time; production
        # code should never override this away from a real asyncio.sleep.
        self._delay_fn: DelayFn = delay_fn or asyncio.sleep

    def _score(self, candidate: DiscoveredAccount) -> ScoredTarget:
        # Fields discovery couldn't determine default to a neutral (not
        # penalized) value rather than the worst case, since an unscored
        # attribute is not evidence of low quality.
        profile = AccountProfile(
            username=candidate.username,
            follower_count=candidate.follower_count or 0,
            following_count=candidate.following_count or 0,
            post_count=candidate.post_count or 0,
            is_private=bool(candidate.is_private),
            bio=candidate.bio if candidate.bio is not None else "unknown bio",
            account_age_days=candidate.account_age_days if candidate.account_age_days is not None else 180,
            has_profile_pic=candidate.has_profile_pic if candidate.has_profile_pic is not None else True,
        )
        quality = calculate_quality_score(profile)
        follow_prob = estimate_follow_probability(profile)
        return ScoredTarget(account=candidate, quality_score=quality, follow_probability=follow_prob)

    async def _execute_one(self, target: ScoredTarget, action_type: ActionType) -> ExecutionResult | None:
        """The only place `ActionExecutor` is invoked. Always pacing-gated.

        Unsupported action types are rejected *before* a token is consumed —
        never after — so a caller passing e.g. STORY_VIEW can't silently
        burn the account's budget on an action nothing executes.
        """
        if action_type not in SUPPORTED_ACTION_TYPES:
            raise NotImplementedError(f"action type not wired: {action_type}")

        allowed = await self.pacing.consume_token(action_type.value)  # type: ignore[arg-type]
        if not allowed:
            return None

        try:
            if action_type == ActionType.LIKE:
                result = await self.executor.like(target.account.instagram_id, media_id="latest")
            elif action_type == ActionType.FOLLOW:
                result = await self.executor.follow(target.account.instagram_id, target.account.username)
            else:  # ActionType.UNFOLLOW
                result = await self.executor.unfollow(target.account.instagram_id, target.account.username)
        except Exception as exc:
            # A transport-level failure (timeout, connection error, ...) is
            # still an outcome that must be logged, not an exception that
            # unwinds the cycle and drops everything already flushed for
            # earlier actions. Treat it as a soft block — conservative, but
            # never silent.
            logger.warning(
                "engine.transport_error", account_id=self.account_id, target=target.account.username,
                action_type=action_type.value, error=str(exc),
            )
            result = ExecutionResult(
                success=False, status=ActionStatus.FAILED, error_code="transport_error",
                error_message=str(exc), dry_run=self.executor.dry_run,
            )

        block = IGBlockDetector.classify(result)
        if block is not None:
            self.pacing.record_block(severity=block)
            logger.warning(
                "engine.block_detected", account_id=self.account_id, target=target.account.username,
                severity=block, error_code=result.error_code, http_status=result.http_status,
            )
        else:
            self.pacing.record_success()

        return result

    async def run_cycle(
        self,
        targeting_config: dict,
        action_types: list[ActionType] | None = None,
        max_candidates: int = 100,
    ) -> CycleResult:
        action_types = action_types or [ActionType.LIKE, ActionType.FOLLOW]
        cycle = CycleResult(account_id=self.account_id)

        if self.pacing.is_throttled:
            cycle.throttled = True
            logger.info("engine.cycle_skipped_throttled", account_id=self.account_id)
            return cycle

        candidates = await self.discovery.discover(self.account_id, targeting_config, max_candidates=max_candidates)
        candidates = await self.discovery.filter_by_criteria(candidates, targeting_config)
        cycle.discovered = len(candidates)

        scored = sorted((self._score(c) for c in candidates), key=lambda s: s.quality_score, reverse=True)
        cycle.scored = len(scored)

        for target in scored:
            if self.pacing.is_throttled:
                cycle.throttled = True
                break
            if target.quality_score < MIN_QUALITY_SCORE:
                cycle.skipped_low_quality += 1
                continue

            for action_type in action_types:
                if self.pacing.is_throttled:
                    cycle.throttled = True
                    break
                if not await self.pacing.can_perform(action_type.value):  # type: ignore[arg-type]
                    continue

                cycle.actions_attempted += 1
                result = await self._execute_one(target, action_type)
                if result is None:
                    continue

                executed = ExecutedAction(
                    target_username=target.account.username,
                    action_type=action_type.value,
                    result=result,
                    quality_score=target.quality_score,
                )
                cycle.executed.append(executed)
                if result.success:
                    cycle.actions_completed += 1
                else:
                    cycle.actions_blocked += 1

                if self.on_result is not None:
                    await self.on_result(executed)

                # Restore human-like spacing between individual actions —
                # without this, a cycle with many eligible targets would
                # burst the account's entire available budget back-to-back,
                # which is exactly the bot-like pattern pacing exists to
                # prevent. Only the whole-cycle sleep in the CLI is not a
                # substitute for this.
                await self._delay_fn(self.pacing.next_action_delay())

        return cycle
