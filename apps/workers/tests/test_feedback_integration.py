"""Integration tests against a real Postgres database (no mocks)."""
import os

import pytest
import pytest_asyncio
from sqlalchemy import select

from src.db import AuditLogEntry, Database, EngagementActionLog, PacingStateSnapshot
from src.discovery import DiscoveredAccount, TargetDiscoveryService, TargetSource
from src.engine import EngagementEngine
from src.execution import ActionExecutor
from src.feedback import make_feedback_sink, record_pacing_snapshot
from src.pacing import PacingConfig, PacingController

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/instagro_test"
)


@pytest_asyncio.fixture
async def db():
    database = Database(TEST_DATABASE_URL)
    try:
        await database.create_all()
    except Exception:
        pytest.skip(f"no real postgres reachable at {TEST_DATABASE_URL}")
    yield database
    await database.drop_all()
    await database.dispose()


class StubDiscovery(TargetDiscoveryService):
    def __init__(self, candidates):
        super().__init__()
        self._candidates = candidates

    async def discover(self, account_id, targeting_config, max_candidates=1000):
        return self._candidates[:max_candidates]


async def no_delay(seconds: float) -> None:
    """Test double for EngagementEngine's inter-action delay — instant."""


def make_pacing():
    from unittest.mock import AsyncMock

    mr = AsyncMock()
    mr.hgetall = AsyncMock(return_value={})
    mr.eval = AsyncMock(return_value=1)
    # active_start_hour/active_end_hour span the full day so these tests
    # don't flake depending on the real wall-clock hour they happen to run at.
    cfg = PacingConfig(warmup_days=14, initial_daily_budget=50, active_start_hour=0, active_end_hour=24)
    return PacingController(redis_client=mr, account_id="acct-db", config=cfg)


@pytest.mark.asyncio
async def test_engine_actions_are_persisted_to_postgres(db):
    candidates = [
        DiscoveredAccount(
            username="good1", instagram_id="ig_good1", source=TargetSource.HASHTAG_ENGAGERS,
            source_ref="#test", follower_count=5000, following_count=800, post_count=120,
        )
    ]
    pacing = make_pacing()
    executor = ActionExecutor(account_id="acct-db")

    async with db.session() as session:
        sink = make_feedback_sink(session, "acct-db")
        engine = EngagementEngine("acct-db", pacing, executor, discovery=StubDiscovery(candidates), on_result=sink, delay_fn=no_delay)
        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})
        await session.commit()

    assert cycle.actions_attempted > 0

    async with db.session() as session:
        rows = (await session.execute(select(EngagementActionLog).where(EngagementActionLog.account_id == "acct-db"))).scalars().all()
        assert len(rows) == cycle.actions_attempted
        for row in rows:
            assert row.dry_run is True
            assert row.target_username == "good1"


@pytest.mark.asyncio
async def test_failed_actions_also_write_an_audit_entry(db):
    """A failure must still be logged — the transparency promise applies to failures too."""
    candidates = [
        DiscoveredAccount(
            username="good1", instagram_id="ig_good1", source=TargetSource.HASHTAG_ENGAGERS,
            source_ref="#test", follower_count=5000, following_count=800, post_count=120,
        )
    ]
    pacing = make_pacing()

    class AlwaysFailClient:
        async def like(self, target_id, media_id):
            from src.execution import ActionStatus, ExecutionResult
            return ExecutionResult(success=False, status=ActionStatus.RATE_LIMITED, http_status=429, error_code="rate_limited", dry_run=True)

        async def follow(self, target_id, target_username):
            return await self.like(target_id, target_username)

    executor = ActionExecutor(account_id="acct-db2", client=AlwaysFailClient(), dry_run=False)

    async with db.session() as session:
        sink = make_feedback_sink(session, "acct-db2")
        engine = EngagementEngine("acct-db2", pacing, executor, discovery=StubDiscovery(candidates), on_result=sink, delay_fn=no_delay)
        cycle = await engine.run_cycle(targeting_config={"min_followers": 0, "max_followers": 100000})
        await session.commit()

    assert cycle.actions_attempted > 0
    assert cycle.actions_completed == 0

    async with db.session() as session:
        audits = (await session.execute(select(AuditLogEntry).where(AuditLogEntry.account_id == "acct-db2"))).scalars().all()
        assert any(a.event == "action.failed" for a in audits)


@pytest.mark.asyncio
async def test_pacing_snapshot_reflects_controller_state(db):
    pacing = make_pacing()
    pacing.record_block("hard")

    async with db.session() as session:
        await record_pacing_snapshot(session, "acct-snap", pacing)
        await session.commit()

    async with db.session() as session:
        rows = (
            await session.execute(select(PacingStateSnapshot).where(PacingStateSnapshot.account_id == "acct-snap"))
        ).scalars().all()
        assert len(rows) == 1
        snap = rows[0]
        assert snap.phase == pacing.phase
        assert snap.consecutive_blocks == pacing.consecutive_blocks == 2
        assert snap.is_throttled == pacing.is_throttled
        assert snap.risk_score == pacing.risk_score()
