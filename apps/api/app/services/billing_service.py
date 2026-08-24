import uuid
from typing import Optional
import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings
from app.db.models import Tenant
from app.services.plan_service import get_plan

settings = get_settings()
stripe.api_key = settings.stripe_secret_key

PRICE_MAP = {"starter": lambda: settings.stripe_price_starter, "growth": lambda: settings.stripe_price_growth, "scale": lambda: settings.stripe_price_scale, "agency": lambda: settings.stripe_price_agency}

def _price(tier: str) -> str:
    fn = PRICE_MAP.get(tier)
    if not fn: raise ValueError(f"Unknown plan: {tier}")
    return fn()

async def create_checkout_session(db: AsyncSession, tenant_id: uuid.UUID, plan_tier: str, billing_period: str, success_url: str, cancel_url: str) -> tuple[str, str]:
    tr = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant: raise ValueError("Tenant not found")
    pid = _price(plan_tier)
    if not pid: raise ValueError(f"No price for {plan_tier}")
    s = stripe.checkout.Session.create(customer=tenant.stripe_customer_id if tenant.stripe_customer_id else None, payment_method_types=["card"], line_items=[{"price": pid, "quantity": 1}], mode="subscription", success_url=success_url, cancel_url=cancel_url, metadata={"tenant_id": str(tenant_id), "plan_tier": plan_tier})
    return s.id, s.url

async def create_portal_session(db: AsyncSession, tenant_id: uuid.UUID, return_url: str) -> str:
    tr = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant or not tenant.stripe_customer_id: raise ValueError("No Stripe customer")
    s = stripe.billing_portal.Session.create(customer=tenant.stripe_customer_id, return_url=return_url)
    return s.url

async def handle_checkout_completed(session: dict, db: AsyncSession) -> None:
    md = session.get("metadata", {})
    tid = md.get("tenant_id")
    if not tid: return
    tenant_id = uuid.UUID(tid)
    cid = session.get("customer")
    sid = session.get("subscription")
    r = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    t = r.scalar_one_or_none()
    if t and cid:
        t.stripe_customer_id = cid
        if sid: t.stripe_subscription_id = sid
        await db.flush()

async def handle_subscription_updated(sub: dict, db: AsyncSession) -> None:
    cid = sub.get("customer")
    if not cid: return
    r = await db.execute(select(Tenant).where(Tenant.stripe_customer_id == str(cid)))
    t = r.scalar_one_or_none()
    if not t: return
    status = sub.get("status", "")
    t.stripe_subscription_id = sub.get("id")
    if status == "active":
        items = sub.get("items", {}).get("data", [])
        if items:
            pid = items[0].get("price", {}).get("id", "")
            for tier, fn in PRICE_MAP.items():
                if fn() == pid: t.plan_tier = tier; break
        t.is_active = True
    elif status in ("canceled", "past_due", "unpaid", "incomplete_expired"):
        t.is_active = False
        if status == "canceled": t.plan_tier = "starter"
    await db.flush()

async def get_subscription_info(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[dict]:
    tr = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant: return None
    plan = get_plan(tenant.plan_tier)
    if not tenant.stripe_subscription_id:
        return {"plan_tier": tenant.plan_tier, "status": "active" if tenant.is_active else "inactive", "billing_period": "monthly", "current_period_end": None, "cancel_at_period_end": False}
    try:
        s = stripe.Subscription.retrieve(tenant.stripe_subscription_id)
        return {"plan_tier": tenant.plan_tier, "status": s.status, "billing_period": "monthly", "current_period_end": str(s.current_period_end), "cancel_at_period_end": s.cancel_at_period_end}
    except stripe.StripeError:
        return {"plan_tier": tenant.plan_tier, "status": "unknown", "billing_period": "monthly", "current_period_end": None, "cancel_at_period_end": False}
