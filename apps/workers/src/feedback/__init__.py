"""Feedback loop — every executed action and safety event is persisted.

This is the enforcement point for the transparency promise: "if it isn't
logged, it didn't happen." `record_action_result` and `record_audit_event`
are the only two places worker code writes to the audit trail, and
`EngagementEngine.run_cycle` calls the former via `on_result` for every
single execution — success or failure.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from src.db import AuditLogEntry, EngagementActionLog
from src.engine import ExecutedAction


async def record_action_result(db: AsyncSession, account_id: str, executed: ExecutedAction) -> None:
    result = executed.result
    db.add(
        EngagementActionLog(
            account_id=account_id,
            target_username=executed.target_username,
            action_type=executed.action_type,
            status=result.status.value,
            success=result.success,
            dry_run=result.dry_run,
            quality_score=executed.quality_score,
            http_status=result.http_status,
            error_code=result.error_code,
            error_message=result.error_message,
            duration_ms=result.duration_ms,
        )
    )
    await db.flush()


async def record_audit_event(db: AsyncSession, account_id: str, event: str, detail: dict | None = None) -> None:
    db.add(AuditLogEntry(account_id=account_id, event=event, detail=detail or {}))
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
