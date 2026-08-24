"""Worker entrypoint — runs the engagement engine for a single account.

Usage:
    python -m src.main <account_id> [--live] [--cycles N] [--sleep SECONDS]

Defaults to dry-run, a small number of cycles, and a short sleep — this is
meant to be run locally against the real engine to prove it works before
any SaaS wrapper exists around it.
"""
from __future__ import annotations

import argparse
import asyncio

import structlog

from src.config import get_settings
from src.db import Database
from src.discovery import TargetDiscoveryService
from src.engine import EngagementEngine
from src.execution import ActionExecutor
from src.feedback import make_feedback_sink, record_audit_event
from src.pacing import PacingConfig, PacingController

logger = structlog.get_logger()

DEFAULT_TARGETING_CONFIG = {
    "min_followers": 100,
    "max_followers": 50000,
    "skip_private_accounts": True,
}


async def run(account_id: str, cycles: int, sleep_seconds: float, live: bool) -> None:
    settings = get_settings()

    import redis.asyncio as redis

    redis_client = redis.from_url(settings.redis_url)
    db = Database(settings.database_url)
    await db.create_all()

    pacing = PacingController(
        redis_client=redis_client,
        account_id=account_id,
        config=PacingConfig(
            warmup_days=settings.default_warmup_days,
            initial_daily_budget=settings.default_initial_actions,
            max_consecutive_blocks=settings.max_consecutive_blocks,
            block_cooldown_minutes=settings.block_cooldown_minutes,
        ),
    )
    executor = ActionExecutor(account_id=account_id, dry_run=not live)
    # In dry-run mode there is no real sourcing yet, so we simulate discovery
    # candidates too — this proves the full pipeline wiring end to end
    # without depending on unimplemented Instagram scraping/API access.
    discovery = TargetDiscoveryService(simulated=not live)

    logger.info("worker.starting", account_id=account_id, live=live, cycles=cycles)

    for i in range(cycles):
        if pacing.is_throttled:
            logger.warning("worker.throttled", account_id=account_id, risk_score=pacing.risk_score())

        async with db.session() as session:
            sink = make_feedback_sink(session, account_id)
            engine = EngagementEngine(account_id, pacing, executor, discovery=discovery, on_result=sink)
            cycle = await engine.run_cycle(DEFAULT_TARGETING_CONFIG)
            await record_audit_event(
                session, account_id, "cycle.completed",
                {
                    "cycle": i, "discovered": cycle.discovered, "scored": cycle.scored,
                    "attempted": cycle.actions_attempted, "completed": cycle.actions_completed,
                    "blocked": cycle.actions_blocked, "throttled": cycle.throttled,
                    "risk_score": pacing.risk_score(),
                },
            )
            await session.commit()

        logger.info(
            "worker.cycle_done", account_id=account_id, cycle=i, discovered=cycle.discovered,
            attempted=cycle.actions_attempted, completed=cycle.actions_completed,
            blocked=cycle.actions_blocked, throttled=cycle.throttled, risk_score=pacing.risk_score(),
        )

        if i < cycles - 1:
            await asyncio.sleep(sleep_seconds)

    await db.dispose()
    await redis_client.aclose()
    logger.info("worker.finished", account_id=account_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Instagro engagement engine for one account.")
    parser.add_argument("account_id")
    parser.add_argument("--live", action="store_true", help="execute against real Instagram (not yet wired — see below)")
    parser.add_argument("--cycles", type=int, default=5)
    parser.add_argument("--sleep", type=float, default=1.0, help="seconds to sleep between cycles")
    args = parser.parse_args()
    if args.live:
        # There is no real InstagramClient wired into this CLI yet, so
        # `--live` can never start a cycle today — `ActionExecutor` requires
        # a real client. Fail fast, before spinning up Redis/Postgres, with
        # an explanation instead of letting the ValueError surface deep in
        # `run()`.
        parser.error(
            "--live is not usable yet: this CLI has no real InstagramClient "
            "implementation to pass to ActionExecutor. Wire one in run() "
            "before using --live."
        )
    asyncio.run(run(args.account_id, cycles=args.cycles, sleep_seconds=args.sleep, live=args.live))


if __name__ == "__main__":
    main()
