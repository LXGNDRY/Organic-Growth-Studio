"""Minimal worker-owned persistence for the engagement engine.

This is intentionally NOT the full multi-tenant SaaS schema in
`apps/api/app/db/models.py` — per the "core engine first" build order, the
worker owns just enough state to prove the engine works and to satisfy the
transparency promise (every action logged) without pulling in tenants,
billing, or auth. When the SaaS layer is built out, these tables get
replaced by / reconciled with the real multi-tenant ones.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class EngagementActionLog(Base):
    """One row per attempted action — the audit trail for a single account."""

    __tablename__ = "worker_engagement_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(String(100), index=True)
    target_instagram_id: Mapped[str] = mapped_column(String(100), default="")
    target_username: Mapped[str] = mapped_column(String(100))
    action_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    success: Mapped[bool] = mapped_column(Boolean)
    followed_back: Mapped[bool | None] = mapped_column(Boolean, default=None)
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True)
    quality_score: Mapped[int] = mapped_column(Integer, default=0)
    http_status: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(50))
    error_message: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PacingStateSnapshot(Base):
    """Point-in-time snapshot of an account's pacing state, for observability."""

    __tablename__ = "worker_pacing_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(String(100), index=True)
    phase: Mapped[str] = mapped_column(String(20))
    warmup_day: Mapped[int] = mapped_column(Integer)
    consecutive_blocks: Mapped[int] = mapped_column(Integer)
    risk_score: Mapped[int] = mapped_column(Integer)
    is_throttled: Mapped[bool] = mapped_column(Boolean)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AuditLogEntry(Base):
    """Transparency log — human-readable record of what the engine did and why."""

    __tablename__ = "worker_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(String(100), index=True)
    event: Mapped[str] = mapped_column(String(100))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class Database:
    """Owns the engine + sessionmaker for the worker's persistence layer."""

    def __init__(self, database_url: str):
        self.engine = create_async_engine(database_url, echo=False, pool_pre_ping=not database_url.startswith("sqlite"))
        self._sessionmaker = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)

    async def create_all(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await self._sync_new_columns(conn)

    async def _sync_new_columns(self, conn) -> None:
        """Adds columns to tables `create_all` can't touch because they
        already exist from a previous version of this schema.

        This worker-owned schema has no Alembic migrations (see
        apps/workers/README.md) — it's meant to stay a minimal, throwaway
        substrate until the SaaS layer takes over persistence. `ADD COLUMN
        IF NOT EXISTS` is the deliberately low-ceremony stopgap for that:
        safe to run on every startup, a no-op once the column exists, and
        avoids ever hand-rolling a real migration for this table before it
        needs one. If this list grows past a couple of entries, that's the
        signal to introduce real migrations instead of extending it.
        """
        if not conn.dialect.name.startswith("postgres"):
            return
        from sqlalchemy import text

        await conn.execute(
            text("ALTER TABLE worker_engagement_actions ADD COLUMN IF NOT EXISTS target_instagram_id VARCHAR(100) DEFAULT ''")
        )
        await conn.execute(
            text("ALTER TABLE worker_engagement_actions ADD COLUMN IF NOT EXISTS followed_back BOOLEAN")
        )

    async def drop_all(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    def session(self) -> AsyncSession:
        return self._sessionmaker()

    async def dispose(self) -> None:
        await self.engine.dispose()


async def get_session(db: Database) -> AsyncGenerator[AsyncSession, None]:
    async with db.session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
