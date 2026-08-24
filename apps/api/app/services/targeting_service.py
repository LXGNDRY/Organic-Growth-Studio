import uuid
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import TargetAccount, TargetingConfig
from app.schemas.targeting import TargetingConfigUpdate

async def get_targeting_config(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID) -> Optional[TargetingConfig]:
    r = await db.execute(select(TargetingConfig).where(TargetingConfig.account_id == account_id, TargetingConfig.tenant_id == tenant_id))
    return r.scalar_one_or_none()

async def upsert_targeting_config(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID, data: TargetingConfigUpdate) -> TargetingConfig:
    existing = await get_targeting_config(db, account_id, tenant_id)
    if existing:
        for f, v in data.model_dump().items():
            setattr(existing, f, v)
        await db.flush()
        return existing
    c = TargetingConfig(account_id=account_id, tenant_id=tenant_id, **data.model_dump())
    db.add(c); await db.flush()
    return c

async def get_targets(db: AsyncSession, account_id: uuid.UUID, tenant_id: uuid.UUID, status: Optional[str] = None, page: int = 1, page_size: int = 20) -> tuple[list[TargetAccount], int]:
    from sqlalchemy import func
    conds = [TargetAccount.account_id == account_id, TargetAccount.tenant_id == tenant_id]
    if status: conds.append(TargetAccount.status == status)
    total = (await db.execute(select(func.count(TargetAccount.id)).where(*conds))).scalar() or 0
    q = select(TargetAccount).where(*conds).order_by(TargetAccount.quality_score.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(q)).scalars().all())
    return items, total
