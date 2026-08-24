import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import EngagementAction, PacingState

async def get_engagement_actions(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID, status: Optional[str] = None, action_type: Optional[str] = None, from_date: Optional[datetime] = None, to_date: Optional[datetime] = None, page: int = 1, page_size: int = 20) -> tuple[list[EngagementAction], int]:
    conds = [EngagementAction.account_id == account_id, EngagementAction.tenant_id == tenant_id]
    if status: conds.append(EngagementAction.status == status)
    if action_type: conds.append(EngagementAction.action_type == action_type)
    if from_date: conds.append(EngagementAction.created_at >= from_date)
    if to_date: conds.append(EngagementAction.created_at <= to_date)
    where = and_(*conds)
    total = (await db.execute(select(func.count(EngagementAction.id)).where(where))).scalar() or 0
    q = select(EngagementAction).where(where).order_by(EngagementAction.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(q)).scalars().all())
    return items, total

async def get_engagement_stats(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID, period: str = "day") -> dict:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=1 if period == "day" else 7 if period == "week" else 30)
    conds = [EngagementAction.account_id == account_id, EngagementAction.tenant_id == tenant_id, EngagementAction.created_at >= start]
    where = and_(*conds)
    total = (await db.execute(select(func.count(EngagementAction.id)).where(where))).scalar() or 0
    type_q = await db.execute(select(EngagementAction.action_type, func.count(EngagementAction.id)).where(where).group_by(EngagementAction.action_type))
    types = {row[0]: row[1] for row in type_q.all()}
    status_q = await db.execute(select(EngagementAction.status, func.count(EngagementAction.id)).where(where).group_by(EngagementAction.status))
    statuses = {row[0]: row[1] for row in status_q.all()}
    fb = (await db.execute(select(func.count(EngagementAction.id)).where(and_(*conds, EngagementAction.action_type == "follow", EngagementAction.followed_back == True)))).scalar() or 0  # noqa: E712
    tf = types.get("follow", 0)
    fbr = (fb / tf) if tf > 0 else 0.0
    completed = statuses.get("completed", 0)
    failed = statuses.get("failed", 0)
    blocked = statuses.get("blocked", 0) + statuses.get("rate_limited", 0)
    return {"account_id": str(account_id), "period": period, "total_actions": total, "likes": types.get("like", 0), "follows": types.get("follow", 0), "unfollows": types.get("unfollow", 0), "story_views": types.get("story_view", 0), "comments": types.get("comment", 0), "follow_back_rate": fbr, "completion_rate": (completed / total) if total > 0 else 0.0, "failed_rate": (failed / total) if total > 0 else 0.0, "blocked_rate": (blocked / total) if total > 0 else 0.0}

async def get_pacing_state(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[PacingState]:
    r = await db.execute(select(PacingState).where(PacingState.account_id == account_id))
    return r.scalar_one_or_none()
