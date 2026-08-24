from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class EngagementActionResponse(BaseModel):
    id: str
    target_username: str
    action_type: str
    status: str
    scheduled_for: Optional[datetime]
    executed_at: Optional[datetime]
    duration_ms: Optional[int]
    error_code: Optional[str]
    error_message: Optional[str]
    followed_back: Optional[bool]
    created_at: datetime
    class Config: from_attributes = True

class EngagementStatsResponse(BaseModel):
    account_id: str
    period: str
    total_actions: int
    likes: int
    follows: int
    unfollows: int
    story_views: int
    comments: int
    follow_back_rate: float
    completion_rate: float
    failed_rate: float
    blocked_rate: float
