import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings
from app.db.models import RefreshToken, Tenant, TenantUser, User

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(pw: str) -> str: return pwd_context.hash(pw)
def verify_password(pw: str, h: str) -> bool: return pwd_context.verify(pw, h)

def create_access_token(user_id: uuid.UUID, tenant_id: uuid.UUID, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "tenant_id": str(tenant_id), "role": role, "type": "access", "exp": exp}, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

def _hash_token(t: str) -> str: return hashlib.sha256(t.encode()).hexdigest()

async def create_refresh_token(db: AsyncSession, user_id: uuid.UUID) -> tuple[str, datetime]:
    raw = secrets.token_urlsafe(64)
    exp = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    rt = RefreshToken(user_id=user_id, token_hash=_hash_token(raw), expires_at=exp)
    db.add(rt); await db.flush()
    return raw, exp

async def validate_refresh_token(db: AsyncSession, raw: str) -> Optional[RefreshToken]:
    h = _hash_token(raw)
    r = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == h, RefreshToken.revoked == False, RefreshToken.expires_at > datetime.now(timezone.utc)))  # noqa: E712
    return r.scalar_one_or_none()

async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    r = await db.execute(select(User).where(User.email == email.lower()))
    return r.scalar_one_or_none()

async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[User]:
    r = await db.execute(select(User).where(User.id == user_id))
    return r.scalar_one_or_none()

async def create_user_and_tenant(db: AsyncSession, email: str, password: str, first_name: Optional[str] = None, last_name: Optional[str] = None, company_name: Optional[str] = None) -> tuple[User, Tenant, TenantUser]:
    user = User(email=email.lower(), password_hash=hash_password(password), first_name=first_name, last_name=last_name)
    db.add(user); await db.flush()
    slug_base = (company_name or email.split("@")[0]).lower().replace(" ", "-")[:50]
    slug = slug_base; counter = 1
    while True:
        existing = await db.execute(select(Tenant).where(Tenant.slug == slug))
        if existing.scalar_one_or_none() is None: break
        counter += 1; slug = f"{slug_base}-{counter}"
    tenant = Tenant(name=company_name or f"{first_name or email}'s workspace", slug=slug, plan_tier="starter")
    db.add(tenant); await db.flush()
    tu = TenantUser(tenant_id=tenant.id, user_id=user.id, role="owner")
    db.add(tu); await db.flush()
    return user, tenant, tu
