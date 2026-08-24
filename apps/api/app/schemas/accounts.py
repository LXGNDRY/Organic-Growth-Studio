from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class InstagramAccountResponse(BaseModel):
    id: str
    username: str
    avatar_url: Optional[str]
    follower_count: int
    following_count: int
    status: str
    risk_level: str
    risk_score: int
    last_synced_at: Optional[datetime]
    created_at: datetime
    class Config: from_attributes = True

class ConnectAccountResponse(BaseModel):
    auth_url: str

class PacingStateResponse(BaseModel):
    account_id: str
    phase: str
    warmup_day: int
    current_daily_budget: int
    actions_today: dict
    risk_score: int
    last_action_at: Optional[datetime]
    class Config: from_attributes = True
