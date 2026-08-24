import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_tenant, get_db
from app.db.models import TenantUser
from app.schemas.common import ApiResponse, PaginatedData, PaginatedResponse
from app.schemas.engagements import EngagementActionResponse, EngagementStatsResponse
from app.services import account_service, engagement_service

router = APIRouter(prefix="/engagements", tags=["engagements"])

def _resp(data):
    import uuid as _u
    from datetime import datetime, timezone
    return ApiResponse(data=data, request_id=str(_u.uuid4()), timestamp=datetime.now(timezone.utc))

@router.get("/{account_id}/actions", response_model=PaginatedResponse[EngagementActionResponse])
async def list_actions(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)], status: str | None = Query(None), action_type: str | None = Query(None), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    a = await account_service.get_account_by_id(db, uuid.UUID(account_id), tenant.tenant_id)
    if not a: raise HTTPException(status_code=404, detail="Not found")
    actions, total = await engagement_service.get_engagement_actions(db, uuid.UUID(account_id), tenant.tenant_id, status=status, action_type=action_type, page=page, page_size=page_size)
    import uuid as _u
    from datetime import datetime, timezone
    return PaginatedResponse(data=PaginatedData(items=[EngagementActionResponse.model_validate(x) for x in actions], total=total, page=page, page_size=page_size, has_more=(page * page_size) < total), request_id=str(_u.uuid4()), timestamp=datetime.now(timezone.utc))

@router.get("/{account_id}/stats", response_model=ApiResponse[EngagementStatsResponse])
async def get_stats(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)], period: str = Query("day", pattern="^(day|week|month)$")):
    a = await account_service.get_account_by_id(db, uuid.UUID(account_id), tenant.tenant_id)
    if not a: raise HTTPException(status_code=404, detail="Not found")
    stats = await engagement_service.get_engagement_stats(db, uuid.UUID(account_id), tenant.tenant_id, period=period)
    return _resp(EngagementStatsResponse(**stats))
