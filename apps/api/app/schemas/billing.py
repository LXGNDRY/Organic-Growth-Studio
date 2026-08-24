from typing import Optional
from pydantic import BaseModel

class CreateCheckoutSessionRequest(BaseModel):
    plan_tier: str
    billing_period: str = "monthly"
    success_url: str
    cancel_url: str

class CheckoutSessionResponse(BaseModel):
    session_id: str
    url: str

class SubscriptionResponse(BaseModel):
    plan_tier: str
    status: str
    billing_period: str
    current_period_end: Optional[str]
    cancel_at_period_end: bool

class PortalSessionResponse(BaseModel):
    url: str
