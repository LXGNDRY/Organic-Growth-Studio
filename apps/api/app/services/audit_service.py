import uuid
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import AuditLog

async def log_event(db: AsyncSession, *, tenant_id: uuid.UUID, actor_user_id: Optional[uuid.UUID], actor_type: str, action: str, resource_type: str, resource_id: Optional[str] = None, ip_address: Optional[str] = None, user_agent: Optional[str] = None, metadata: Optional[dict[str, Any]] = None) -> None:
    entry = AuditLog(tenant_id=tenant_id, actor_user_id=actor_user_id, actor_type=actor_type, action=action, resource_type=resource_type, resource_id=str(resource_id) if resource_id else None, ip_address=ip_address, user_agent=user_agent, metadata_json=metadata or {})
    db.add(entry)
