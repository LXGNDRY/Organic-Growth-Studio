import uuid
from datetime import datetime, timezone
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base

def _now():
    return datetime.now(timezone.utc)

class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    plan_tier: Mapped[str] = mapped_column(String(20), default="starter")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(100), index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    users: Mapped[list["TenantUser"]] = relationship(back_populates="tenant")
    accounts: Mapped[list["InstagramAccount"]] = relationship(back_populates="tenant")

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    tenants: Mapped[list["TenantUser"]] = relationship(back_populates="user")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user")

class TenantUser(Base):
    __tablename__ = "tenant_users"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_tenant_user"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20), default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    tenant: Mapped[Tenant] = relationship(back_populates="users")
    user: Mapped[User] = relationship(back_populates="tenants")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    user: Mapped[User] = relationship(back_populates="refresh_tokens")

class InstagramAccount(Base):
    __tablename__ = "instagram_accounts"
    __table_args__ = (UniqueConstraint("tenant_id", "instagram_id", name="uq_tenant_instagram_id"), Index("ix_accounts_tenant_status", "tenant_id", "status"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    instagram_id: Mapped[str] = mapped_column(String(100))
    username: Mapped[str] = mapped_column(String(100))
    access_token: Mapped[str] = mapped_column(Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    follower_count: Mapped[int] = mapped_column(Integer, default=0)
    following_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="provisioning")
    risk_level: Mapped[str] = mapped_column(String(10), default="low")
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    tenant: Mapped[Tenant] = relationship(back_populates="accounts")
    targeting_config: Mapped["TargetingConfig | None"] = relationship(back_populates="account", uselist=False)
    pacing_state: Mapped["PacingState | None"] = relationship(back_populates="account", uselist=False)

class TargetingConfig(Base):
    __tablename__ = "targeting_configs"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instagram_accounts.id", ondelete="CASCADE"), unique=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    competitors: Mapped[list] = mapped_column(JSON, default=list)
    hashtags: Mapped[list] = mapped_column(JSON, default=list)
    locations: Mapped[list] = mapped_column(JSON, default=list)
    min_followers: Mapped[int] = mapped_column(Integer, default=100)
    max_followers: Mapped[int] = mapped_column(Integer, default=50000)
    min_following: Mapped[int] = mapped_column(Integer, default=0)
    max_following: Mapped[int] = mapped_column(Integer, default=10000)
    min_posts: Mapped[int] = mapped_column(Integer, default=3)
    gender: Mapped[str] = mapped_column(String(10), default="any")
    languages: Mapped[list] = mapped_column(JSON, default=list)
    enabled_actions: Mapped[list] = mapped_column(JSON, default=["like", "follow"])
    daily_like_limit: Mapped[int] = mapped_column(Integer, default=200)
    daily_follow_limit: Mapped[int] = mapped_column(Integer, default=100)
    daily_unfollow_limit: Mapped[int] = mapped_column(Integer, default=100)
    daily_story_view_limit: Mapped[int] = mapped_column(Integer, default=500)
    daily_comment_limit: Mapped[int] = mapped_column(Integer, default=0)
    follow_back_ratio_min: Mapped[float] = mapped_column(Float, default=0.1)
    follow_back_ratio_max: Mapped[float] = mapped_column(Float, default=5.0)
    active_hours: Mapped[dict] = mapped_column(JSON, default=dict)
    unfollow_after_days: Mapped[int] = mapped_column(Integer, default=14)
    skip_private_accounts: Mapped[bool] = mapped_column(Boolean, default=True)
    skip_business_accounts: Mapped[bool] = mapped_column(Boolean, default=False)
    blacklisted_usernames: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    account: Mapped[InstagramAccount] = relationship(back_populates="targeting_config")

class TargetAccount(Base):
    __tablename__ = "target_accounts"
    __table_args__ = (UniqueConstraint("account_id", "instagram_id", name="uq_account_target_instagram_id"), Index("ix_targets_account_status", "account_id", "status"), Index("ix_targets_account_quality", "account_id", "quality_score"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instagram_accounts.id", ondelete="CASCADE"))
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    username: Mapped[str] = mapped_column(String(100))
    instagram_id: Mapped[str] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(30))
    source_ref: Mapped[str] = mapped_column(String(200))
    quality_score: Mapped[int] = mapped_column(Integer, default=0)
    follow_probability: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20), default="new")
    follower_count: Mapped[int | None] = mapped_column(Integer)
    following_count: Mapped[int | None] = mapped_column(Integer)
    post_count: Mapped[int | None] = mapped_column(Integer)
    bio: Mapped[str | None] = mapped_column(Text)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    last_engaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

class PacingState(Base):
    __tablename__ = "pacing_states"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instagram_accounts.id", ondelete="CASCADE"), unique=True)
    phase: Mapped[str] = mapped_column(String(20), default="warmup")
    warmup_day: Mapped[int] = mapped_column(Integer, default=0)
    current_daily_budget: Mapped[int] = mapped_column(Integer, default=50)
    actions_today: Mapped[dict] = mapped_column(JSON, default=dict)
    last_block_detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consecutive_blocks: Mapped[int] = mapped_column(Integer, default=0)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    last_action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    day_date: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    account: Mapped[InstagramAccount] = relationship(back_populates="pacing_state")

class EngagementAction(Base):
    __tablename__ = "engagement_actions"
    __table_args__ = (Index("ix_actions_account_status", "account_id", "status"), Index("ix_actions_account_created", "account_id", "created_at"), Index("ix_actions_account_action_type", "account_id", "action_type"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instagram_accounts.id", ondelete="CASCADE"))
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    target_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("target_accounts.id"))
    target_username: Mapped[str] = mapped_column(String(100))
    action_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    priority: Mapped[int] = mapped_column(Integer, default=0)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    http_status: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(50))
    error_message: Mapped[str | None] = mapped_column(Text)
    followed_back: Mapped[bool | None] = mapped_column(Boolean)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

class FollowerSnapshot(Base):
    __tablename__ = "follower_snapshots"
    __table_args__ = (Index("ix_snapshots_account_date", "account_id", "snapshot_date"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("instagram_accounts.id", ondelete="CASCADE"))
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    snapshot_date: Mapped[str] = mapped_column(String(10))
    follower_count: Mapped[int] = mapped_column(Integer, default=0)
    following_count: Mapped[int] = mapped_column(Integer, default=0)
    net_growth: Mapped[int] = mapped_column(Integer, default=0)
    engagement_rate: Mapped[float] = mapped_column(Float, default=0.0)
    avg_likes_per_post: Mapped[float] = mapped_column(Float, default=0.0)
    avg_comments_per_post: Mapped[float] = mapped_column(Float, default=0.0)
    quality_avg_score: Mapped[float] = mapped_column(Float, default=0.0)
    quality_high_count: Mapped[int] = mapped_column(Integer, default=0)
    quality_medium_count: Mapped[int] = mapped_column(Integer, default=0)
    quality_low_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_tenant_created", "tenant_id", "created_at"), Index("ix_audit_actor", "actor_user_id"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    actor_type: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(100))
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[str | None] = mapped_column(String(100))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
