from dataclasses import dataclass
from enum import Enum

class TargetSource(str, Enum):
    COMPETITOR_FOLLOWERS = "competitor_followers"
    HASHTAG_ENGAGERS = "hashtag_engagers"
    LOCATION_TAGGED = "location_tagged"
    SIMILAR_ACCOUNTS = "similar_accounts"
    AI_SUGGESTED = "ai_suggested"

@dataclass
class DiscoveredAccount:
    username: str
    instagram_id: str
    source: TargetSource
    source_ref: str
    follower_count: int | None = None
    following_count: int | None = None
    post_count: int | None = None
    is_private: bool | None = None

class TargetDiscoveryService:
    """Orchestrates target discovery from multiple sources.

    Skeleton — production fetches from Instagram API/scrapers and feeds
    through the scoring service before inserting into target_accounts.
    """
    def __init__(self): self.sources: dict = {}

    async def discover(self, account_id: str, targeting_config: dict, max_candidates: int = 1000) -> list[DiscoveredAccount]:
        return []

    async def filter_by_criteria(self, candidates: list[DiscoveredAccount], cfg: dict) -> list[DiscoveredAccount]:
        out = []
        min_f = cfg.get("min_followers", 100)
        max_f = cfg.get("max_followers", 50000)
        skip_private = cfg.get("skip_private_accounts", True)
        for c in candidates:
            if c.follower_count is not None:
                if c.follower_count < min_f or c.follower_count > max_f: continue
            if skip_private and c.is_private: continue
            out.append(c)
        return out
