from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class ActiveHoursConfig(BaseModel):
    start_hour: int = Field(ge=0, le=23, default=9)
    end_hour: int = Field(ge=0, le=23, default=22)
    timezone: str = "UTC"

class TargetingConfigBase(BaseModel):
    competitors: list[str] = Field(default_factory=list)
    hashtags: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    min_followers: int = Field(ge=0, default=100)
    max_followers: int = Field(ge=0, default=50000)
    min_following: int = Field(ge=0, default=0)
    max_following: int = Field(ge=0, default=10000)
    min_posts: int = Field(ge=0, default=3)
    gender: str = "any"
    languages: list[str] = Field(default_factory=lambda: ["en"])
    enabled_actions: list[str] = Field(default_factory=lambda: ["like", "follow"])
    daily_like_limit: int = Field(ge=0, le=2000, default=200)
    daily_follow_limit: int = Field(ge=0, le=1000, default=100)
    daily_unfollow_limit: int = Field(ge=0, le=1000, default=100)
    daily_story_view_limit: int = Field(ge=0, le=5000, default=500)
    daily_comment_limit: int = Field(ge=0, le=200, default=0)
    follow_back_ratio_min: float = Field(ge=0, le=10, default=0.1)
    follow_back_ratio_max: float = Field(ge=0, le=10, default=5.0)
    active_hours: ActiveHoursConfig = Field(default_factory=ActiveHoursConfig)
    unfollow_after_days: int = Field(ge=1, le=90, default=14)
    skip_private_accounts: bool = True
    skip_business_accounts: bool = False
    blacklisted_usernames: list[str] = Field(default_factory=list)

class TargetingConfigUpdate(TargetingConfigBase):
    pass

class TargetingConfigResponse(TargetingConfigBase):
    id: str
    account_id: str
    created_at: datetime
    updated_at: datetime
    class Config: from_attributes = True

class TargetAccountResponse(BaseModel):
    id: str
    username: str
    source: str
    quality_score: int
    follow_probability: float
    status: str
    follower_count: Optional[int]
    following_count: Optional[int]
    is_private: bool
    last_engaged_at: Optional[datetime]
    class Config: from_attributes = True
