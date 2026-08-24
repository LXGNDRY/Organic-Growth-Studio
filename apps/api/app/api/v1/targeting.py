import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_tenant, get_db
from app.db.models import TenantUser
from app.schemas.common import ApiResponse, PaginatedData, PaginatedResponse
from app.schemas.targeting import TargetAccountResponse, TargetingConfigResponse, TargetingConfigUpdate
from app.services import account_service, audit_service, targeting_service

router = APIRouter(prefix="/targeting", tags=["targeting"])

def _resp(data):
    import uuid as _u
    from datetime import datetime, timezone
    return ApiResponse(data=data, request_id=str(_u.uuid4()), timestamp=datetime.now(timezone.utc))

@router.get("/{account_id}", response_model=ApiResponse[TargetingConfigResponse])
async def get_config(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    a = await account_service.get_account_by_id(db, uuid.UUID(account_id), tenant.tenant_id)
    if not a: raise HTTPException(status_code=404, detail="Not found")
    c = await targeting_service.get_targeting_config(db, uuid.UUID(account_id), tenant.tenant_id)
    if not c:
        default = TargetingConfigUpdate()
        return _resp(TargetingConfigResponse(id=str(uuid.UUID(int=0)), account_id=account_id, created_at=a.created_at, updated_at=a.updated_at, **default.model_dump()))
    return _resp(TargetingConfigResponse.model_validate(c))

@router.put("/{account_id}", response_model=ApiResponse[TargetingConfigResponse])
async def update_config(account_id: str, data: TargetingConfigUpdate, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    a = await account_service.get_account_by_id(db, uuid.UUID(account_id), tenant.tenant_id)
    if not a: raise HTTPException(status_code=404, detail="Not found")
    c = await targeting_service.upsert_targeting_config(db, uuid.UUID(account_id), tenant.tenant_id, data)
    await audit_service.log_event(db, tenant_id=tenant.tenant_id, actor_user_id=tenant.user_id, actor_type="user", action="targeting.update", resource_type="targeting_config", resource_id=str(c.id))
    await db.commit()
    return _resp(TargetingConfigResponse.model_validate(c))

@router.get("/{account_id}/targets", response_model=PaginatedResponse[TargetAccountResponse])
async def list_targets(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)], status: str | None = Query(None), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    a = await account_service.get_account_by_id(db, uuid.UUID(account_id), tenant.tenant_id)
    if not a: raise HTTPException(status_code=404, detail="Not found")
    targets, total = await targeting_service.get_targets(db, uuid.UUID(account_id), tenant.tenant_id, status=status, page=page, page_size=page_size)
    import uuid as _u
    from datetime import datetime, timezone
    return PaginatedResponse(data=PaginatedData(items=[TargetAccountResponse.model_validate(t) for t in targets], total=total, page=page, page_size=page_size, has_more=(page * page_size) < total), request_id=str(_u.uuid4()), timestamp=datetime.now(timezone.utc))
