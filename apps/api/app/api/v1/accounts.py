import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_tenant, get_db
from app.db.models import TenantUser
from app.schemas.accounts import ConnectAccountResponse, InstagramAccountResponse, PacingStateResponse
from app.schemas.common import ApiResponse
from app.services import account_service, audit_service

router = APIRouter(prefix="/accounts", tags=["accounts"])

def _resp(data):
    import uuid as _u
    from datetime import datetime, timezone
    return ApiResponse(data=data, request_id=str(_u.uuid4()), timestamp=datetime.now(timezone.utc))

@router.get("", response_model=ApiResponse[list[InstagramAccountResponse]])
async def list_accounts(tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    accounts = await account_service.get_accounts_for_tenant(db, tenant.tenant_id)
    return _resp([InstagramAccountResponse.model_validate(a) for a in accounts])

@router.get("/connect/url", response_model=ApiResponse[ConnectAccountResponse])
async def get_connect_url(request: Request, tenant: Annotated[TenantUser, Depends(get_current_tenant)]):
    from app.config import get_settings
    s = get_settings()
    if not s.instagram_app_id:
        raise HTTPException(status_code=503, detail="Instagram OAuth not configured")
    state = f"{tenant.tenant_id}:{uuid.uuid4().hex}"
    auth_url = f"https://api.instagram.com/oauth/authorize?client_id={s.instagram_app_id}&redirect_uri={s.instagram_redirect_uri}&scope=user_profile,user_media&response_type=code&state={state}"
    return _resp(ConnectAccountResponse(auth_url=auth_url))

@router.get("/{account_id}", response_model=ApiResponse[InstagramAccountResponse])
async def get_account(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    a = await account_service.get_account_by_id(db, uuid.UUID(account_id), tenant.tenant_id)
    if not a: raise HTTPException(status_code=404, detail="Not found")
    return _resp(InstagramAccountResponse.model_validate(a))

@router.get("/{account_id}/pacing", response_model=ApiResponse[PacingStateResponse])
async def get_pacing(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    from app.services.engagement_service import get_pacing_state
    a = await account_service.get_account_by_id(db, uuid.UUID(account_id), tenant.tenant_id)
    if not a: raise HTTPException(status_code=404, detail="Not found")
    p = await get_pacing_state(db, uuid.UUID(account_id), tenant.tenant_id)
    if not p: raise HTTPException(status_code=404, detail="No pacing state")
    return _resp(PacingStateResponse.model_validate(p))

@router.post("/{account_id}/pause", response_model=ApiResponse[InstagramAccountResponse])
async def pause_account(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    a = await account_service.update_account_status(db, uuid.UUID(account_id), tenant.tenant_id, status="paused")
    if not a: raise HTTPException(status_code=404, detail="Not found")
    await audit_service.log_event(db, tenant_id=tenant.tenant_id, actor_user_id=tenant.user_id, actor_type="user", action="account.pause", resource_type="account", resource_id=account_id)
    await db.commit()
    return _resp(InstagramAccountResponse.model_validate(a))

@router.post("/{account_id}/resume", response_model=ApiResponse[InstagramAccountResponse])
async def resume_account(account_id: str, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    a = await account_service.update_account_status(db, uuid.UUID(account_id), tenant.tenant_id, status="active")
    if not a: raise HTTPException(status_code=404, detail="Not found")
    await audit_service.log_event(db, tenant_id=tenant.tenant_id, actor_user_id=tenant.user_id, actor_type="user", action="account.resume", resource_type="account", resource_id=account_id)
    await db.commit()
    return _resp(InstagramAccountResponse.model_validate(a))
