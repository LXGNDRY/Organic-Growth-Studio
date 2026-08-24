import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import InstagramAccount, PacingState, Tenant
from app.services.plan_service import can_add_account

async def get_accounts_for_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> list[InstagramAccount]:
    r = await db.execute(select(InstagramAccount).where(InstagramAccount.tenant_id == tenant_id))
    return list(r.scalars().all())

async def get_account_by_id(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[InstagramAccount]:
    r = await db.execute(select(InstagramAccount).where(InstagramAccount.id == account_id, InstagramAccount.tenant_id == tenant_id))
    return r.scalar_one_or_none()

async def create_account(db: AsyncSession, tenant_id: uuid.UUID, instagram_id: str, username: str, access_token: str, token_expires_at: Optional[datetime] = None, avatar_url: Optional[str] = None, follower_count: int = 0, following_count: int = 0) -> InstagramAccount:
    tr = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant: raise ValueError("Tenant not found")
    existing = await get_accounts_for_tenant(db, tenant_id)
    if not can_add_account(tenant.plan_tier, len(existing)): raise ValueError("Account limit reached")
    account = InstagramAccount(tenant_id=tenant_id, instagram_id=instagram_id, username=username, access_token=access_token, token_expires_at=token_expires_at, avatar_url=avatar_url, follower_count=follower_count, following_count=following_count, status="warming_up")
    db.add(account); await db.flush()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pacing = PacingState(account_id=account.id, phase="warmup", warmup_day=0, current_daily_budget=50, actions_today={}, risk_score=0, day_date=today)
    db.add(pacing); await db.flush()
    return account

async def update_account_status(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID, status: str, risk_level: Optional[str] = None, risk_score: Optional[int] = None) -> Optional[InstagramAccount]:
    a = await get_account_by_id(db, account_id, tenant_id)
    if not a: return None
    a.status = status
    if risk_level is not None: a.risk_level = risk_level
    if risk_score is not None: a.risk_score = risk_score
    await db.flush()
    return a
