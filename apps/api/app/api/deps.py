import uuid
from typing import Annotated
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings
from app.db.base import get_db
from app.db.models import TenantUser, User
from app.services.auth_service import get_user_by_id

settings = get_settings()

async def get_current_user(request: Request, db: Annotated[AsyncSession, Depends(get_db)]) -> User:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization", headers={"WWW-Authenticate": "Bearer"})
    token = auth.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user_id = uuid.UUID(payload.get("sub", ""))
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_current_tenant(request: Request, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> TenantUser:
    from sqlalchemy import select
    tenant_id_header = request.headers.get("X-Tenant-Id")
    if tenant_id_header:
        try: tid = uuid.UUID(tenant_id_header)
        except ValueError: raise HTTPException(status_code=400, detail="Invalid X-Tenant-Id")
        result = await db.execute(select(TenantUser).where(TenantUser.tenant_id == tid, TenantUser.user_id == current_user.id))
        tu = result.scalar_one_or_none()
        if not tu: raise HTTPException(status_code=403, detail="No access")
        return tu
    result = await db.execute(select(TenantUser).where(TenantUser.user_id == current_user.id).order_by(TenantUser.joined_at.asc()).limit(1))
    tu = result.scalar_one_or_none()
    if not tu: raise HTTPException(status_code=404, detail="No tenant found")
    return tu
