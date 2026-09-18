"""Feedback loop — every executed action and safety event is persisted.

This is the enforcement point for the transparency promise: "if it isn't
logged, it didn't happen." `record_action_result` and `record_audit_event`
are the only two places worker code writes to the audit trail, and
`EngagementEngine.run_cycle` calls the former via `on_result` for every
single execution — success or failure. `record_pacing_snapshot` gives an
observer (dashboard, alert, or just a human reading the table) a
point-in-time view of an account's risk without replaying every action.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import AuditLogEntry, EngagementActionLog, PacingStateSnapshot
from src.engine import ExecutedAction
from src.pacing import PacingController


async def record_action_result(db: AsyncSession, account_id: str, executed: ExecutedAction) -> None:
    result = executed.result
    db.add(
        EngagementActionLog(
            account_id=account_id,
            target_instagram_id=executed.target_instagram_id,
            target_username=executed.target_username,
            action_type=executed.action_type,
            status=result.status.value,
            success=result.success,
            followed_back=result.followed_back,
            dry_run=result.dry_run,
            quality_score=executed.quality_score,
            http_status=result.http_status,
            error_code=result.error_code,
            error_message=result.error_message,
            duration_ms=result.duration_ms,
        )
    )
    await db.flush()


async def find_stale_follows(
    db: AsyncSession, account_id: str, unfollow_after_days: int, now: datetime | None = None,
) -> list[tuple[str, str]]:
    """Finds accounts followed more than `unfollow_after_days` ago that
    haven't followed back and haven't been unfollowed since — the source
    of truth for the unfollow half of the follow/unfollow pattern, read
    back from the audit log itself rather than tracked in separate mutable
    state.

    For each target this looks only at its *most recent* follow: a target
    re-followed after an earlier unfollow is judged against that new
    follow, not the stale old one, and an unfollow only clears a follow it
    actually came after — an unfollow-then-refollow can't accidentally
    exempt a target from ever going stale again.

    Returns a list of (instagram_id, username) tuples, oldest (latest)
    follow first, ready to pass to `EngagementEngine.run_unfollow_cycle`.
    """
    cutoff = (now or datetime.now(UTC)) - timedelta(days=unfollow_after_days)

    follows = (
        await db.execute(
            select(EngagementActionLog)
            .where(
                EngagementActionLog.account_id == account_id,
                EngagementActionLog.action_type == "follow",
                EngagementActionLog.success.is_(True),
            )
            .order_by(EngagementActionLog.executed_at.asc())
        )
    ).scalars().all()

    unfollows = (
        await db.execute(
            select(EngagementActionLog.target_instagram_id, EngagementActionLog.executed_at).where(
                EngagementActionLog.account_id == account_id,
                EngagementActionLog.action_type == "unfollow",
                EngagementActionLog.success.is_(True),
            )
        )
    ).all()

    # Ascending iteration means the last write per target is always the
    # most recent — no separate max() pass needed.
    latest_follow_by_target: dict[str, EngagementActionLog] = {}
    for row in follows:
        latest_follow_by_target[row.target_instagram_id] = row

    latest_unfollow_at_by_target: dict[str, datetime] = {}
    for target_id, executed_at in unfollows:
        prior = latest_unfollow_at_by_target.get(target_id)
        if prior is None or executed_at > prior:
            latest_unfollow_at_by_target[target_id] = executed_at

    stale: list[tuple[str, str]] = []
    for target_id, follow in latest_follow_by_target.items():
        if follow.followed_back:
            continue
        if follow.executed_at > cutoff:
            continue
        unfollowed_at = latest_unfollow_at_by_target.get(target_id)
        if unfollowed_at is not None and unfollowed_at > follow.executed_at:
            continue
        stale.append((target_id, follow.target_username, follow.executed_at))

    stale.sort(key=lambda t: t[2])
    return [(target_id, username) for target_id, username, _ in stale]


async def record_audit_event(db: AsyncSession, account_id: str, event: str, detail: dict | None = None) -> None:
    db.add(AuditLogEntry(account_id=account_id, event=event, detail=detail or {}))
    await db.flush()


async def record_pacing_snapshot(db: AsyncSession, account_id: str, pacing: PacingController) -> None:
    db.add(
        PacingStateSnapshot(
            account_id=account_id,
            phase=pacing.phase,
            warmup_day=pacing.warmup_day,
            consecutive_blocks=pacing.consecutive_blocks,
            risk_score=pacing.risk_score(),
            is_throttled=pacing.is_throttled,
        )
    )
    await db.flush()


def make_feedback_sink(db: AsyncSession, account_id: str):
    """Builds an `on_result` callback bound to a session/account for `EngagementEngine`."""

    async def _sink(executed: ExecutedAction) -> None:
        await record_action_result(db, account_id, executed)
        if not executed.result.success:
            await record_audit_event(
                db, account_id, "action.failed",
                {"target": executed.target_username, "action_type": executed.action_type, "error_code": executed.result.error_code},
            )

    return _sink
