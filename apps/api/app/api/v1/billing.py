from typing import Annotated
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_tenant, get_db
from app.db.models import TenantUser
from app.schemas.billing import CheckoutSessionResponse, CreateCheckoutSessionRequest, PortalSessionResponse, SubscriptionResponse
from app.schemas.common import ApiResponse
from app.services import billing_service

router = APIRouter(prefix="/billing", tags=["billing"])

def _resp(data):
    import uuid
    from datetime import datetime, timezone
    return ApiResponse(data=data, request_id=str(uuid.uuid4()), timestamp=datetime.now(timezone.utc))

@router.post("/checkout", response_model=ApiResponse[CheckoutSessionResponse])
async def create_checkout(data: CreateCheckoutSessionRequest, tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    try:
        sid, url = await billing_service.create_checkout_session(db, tenant.tenant_id, data.plan_tier, data.billing_period, data.success_url, data.cancel_url)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))
    return _resp(CheckoutSessionResponse(session_id=sid, url=url))

@router.post("/portal", response_model=ApiResponse[PortalSessionResponse])
async def create_portal(tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)], return_url: str = "/dashboard/settings/billing"):
    try:
        url = await billing_service.create_portal_session(db, tenant.tenant_id, return_url)
    except ValueError as e: raise HTTPException(status_code=400, detail=str(e))
    return _resp(PortalSessionResponse(url=url))

@router.get("/subscription", response_model=ApiResponse[SubscriptionResponse])
async def get_subscription(tenant: Annotated[TenantUser, Depends(get_current_tenant)], db: Annotated[AsyncSession, Depends(get_db)]):
    info = await billing_service.get_subscription_info(db, tenant.tenant_id)
    if not info: raise HTTPException(status_code=404, detail="Not found")
    return _resp(SubscriptionResponse(**info))

@router.post("/webhook", status_code=204)
async def stripe_webhook(request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    from app.config import get_settings
    s = get_settings()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    if not s.stripe_webhook_secret:
        if s.is_development: return None
        raise HTTPException(status_code=503, detail="Webhook not configured")
    try:
        event = stripe.Webhook.construct_event(payload, sig, s.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    etype = event["type"]
    edata = event["data"]["object"]
    try:
        if etype == "checkout.session.completed":
            await billing_service.handle_checkout_completed(edata, db)
        elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            await billing_service.handle_subscription_updated(edata, db)
        await db.commit()
    except Exception:
        await db.rollback()
    return None
