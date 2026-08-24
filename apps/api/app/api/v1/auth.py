import uuid
from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db
from app.schemas.auth import AuthResponse, AuthTokens, SignInRequest, SignUpRequest, TenantResponse, TokenRefreshRequest, UserResponse
from app.services import audit_service
from app.services.auth_service import create_access_token, create_refresh_token, create_user_and_tenant, get_user_by_email, validate_refresh_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"

def _build_response(user, tenant_user, access_token, refresh_token, expires_in):
    return AuthResponse(
        user=UserResponse.model_validate(user),
        tokens=AuthTokens(access_token=access_token, refresh_token=refresh_token, expires_in=expires_in),
        tenant=TenantResponse(id=str(tenant_user.tenant.id), name=tenant_user.tenant.name, slug=tenant_user.tenant.slug, plan_tier=tenant_user.tenant.plan_tier, role=tenant_user.role, created_at=tenant_user.tenant.created_at),
    )

@router.post("/signup", response_model=AuthResponse, status_code=201)
async def signup(request: Request, data: SignUpRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    existing = await get_user_by_email(db, data.email)
    if existing: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
    user, tenant, tenant_user = await create_user_and_tenant(db, email=data.email, password=data.password, first_name=data.first_name, last_name=data.last_name, company_name=data.company_name)
    access_token = create_access_token(user.id, tenant.id, tenant_user.role)
    refresh_token, _ = await create_refresh_token(db, user.id)
    await audit_service.log_event(db, tenant_id=tenant.id, actor_user_id=user.id, actor_type="user", action="user.signup", resource_type="user", resource_id=str(user.id), ip_address=_ip(request), user_agent=request.headers.get("user-agent"))
    await db.commit()
    from app.config import get_settings
    s = get_settings()
    return _build_response(user, tenant_user, access_token, refresh_token, s.access_token_expire_minutes * 60)

@router.post("/signin", response_model=AuthResponse)
async def signin(request: Request, data: SignInRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    user = await get_user_by_email(db, data.email)
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    from sqlalchemy import select
    from app.db.models import TenantUser
    result = await db.execute(select(TenantUser).where(TenantUser.user_id == user.id).order_by(TenantUser.joined_at.asc()).limit(1))
    tu = result.scalar_one_or_none()
    if not tu: raise HTTPException(status_code=500, detail="No tenant")
    user.last_login_at = datetime.now(timezone.utc)
    access_token = create_access_token(user.id, tu.tenant_id, tu.role)
    refresh_token, _ = await create_refresh_token(db, user.id)
    await audit_service.log_event(db, tenant_id=tu.tenant_id, actor_user_id=user.id, actor_type="user", action="user.signin", resource_type="user", resource_id=str(user.id), ip_address=_ip(request), user_agent=request.headers.get("user-agent"))
    await db.commit()
    from app.config import get_settings
    s = get_settings()
    return _build_response(user, tu, access_token, refresh_token, s.access_token_expire_minutes * 60)

@router.post("/refresh", response_model=AuthTokens)
async def refresh(data: TokenRefreshRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    token = await validate_refresh_token(db, data.refresh_token)
    if not token: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = token.user
    from sqlalchemy import select
    from app.db.models import TenantUser
    result = await db.execute(select(TenantUser).where(TenantUser.user_id == user.id).order_by(TenantUser.joined_at.asc()).limit(1))
    tu = result.scalar_one_or_none()
    if not tu: raise HTTPException(status_code=500, detail="No tenant")
    access_token = create_access_token(user.id, tu.tenant_id, tu.role)
    new_refresh, _ = await create_refresh_token(db, user.id)
    token.revoked = True
    await db.commit()
    from app.config import get_settings
    s = get_settings()
    return AuthTokens(access_token=access_token, refresh_token=new_refresh, expires_in=s.access_token_expire_minutes * 60)

@router.post("/logout", status_code=204)
async def logout(data: TokenRefreshRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    token = await validate_refresh_token(db, data.refresh_token)
    if token:
        token.revoked = True
        await db.commit()
    return None
