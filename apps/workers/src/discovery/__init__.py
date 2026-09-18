import random
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
    is_business: bool | None = None
    bio: str | None = None
    account_age_days: int | None = None
    has_profile_pic: bool | None = None

class TargetDiscoveryService:
    """Orchestrates target discovery from multiple sources.

    Skeleton — production fetches from Instagram API/scrapers and feeds
    through the scoring service before inserting into target_accounts.
    """
    def __init__(self, simulated: bool = False, seed: random.Random | None = None):
        self.sources: dict = {}
        self.simulated = simulated
        self._rng = seed or random.Random()

    async def discover(self, account_id: str, targeting_config: dict, max_candidates: int = 1000) -> list[DiscoveredAccount]:
        if not self.simulated:
            # Real production sourcing is not implemented yet — this stub is
            # intentionally inert so callers don't silently get fake data
            # when they meant to hit the real Instagram API/scrapers.
            return []
        return self._simulate_candidates(targeting_config, max_candidates)

    def _simulate_candidates(self, cfg: dict, max_candidates: int) -> list[DiscoveredAccount]:
        min_f = cfg.get("min_followers", 100)
        max_f = cfg.get("max_followers", 50000)
        n = min(max_candidates, 20)
        out = []
        for i in range(n):
            followers = self._rng.randint(max(min_f, 1), max(max_f, min_f + 1))
            following = self._rng.randint(50, 3000)
            out.append(
                DiscoveredAccount(
                    username=f"sim_user_{i}",
                    instagram_id=f"sim_{i}",
                    source=TargetSource.AI_SUGGESTED,
                    source_ref="simulated",
                    follower_count=followers,
                    following_count=following,
                    post_count=self._rng.randint(0, 400),
                    is_private=self._rng.random() < 0.15,
                    is_business=self._rng.random() < 0.2,
                    account_age_days=self._rng.randint(10, 1500),
                    has_profile_pic=self._rng.random() > 0.05,
                )
            )
        return out

    async def filter_by_criteria(self, candidates: list[DiscoveredAccount], cfg: dict) -> list[DiscoveredAccount]:
        out = []
        min_f = cfg.get("min_followers", 100)
        max_f = cfg.get("max_followers", 50000)
        min_following = cfg.get("min_following", 0)
        max_following = cfg.get("max_following", 10000)
        min_posts = cfg.get("min_posts", 3)
        skip_private = cfg.get("skip_private_accounts", True)
        skip_business = cfg.get("skip_business_accounts", False)
        # Case-insensitive: a targeting rule shouldn't fail to exclude an
        # account just because of how its username happened to be cased.
        blacklist = {u.lower() for u in cfg.get("blacklisted_usernames", [])}
        for c in candidates:
            if c.follower_count is not None:
                if c.follower_count < min_f or c.follower_count > max_f: continue
            if c.following_count is not None:
                if c.following_count < min_following or c.following_count > max_following: continue
            if c.post_count is not None:
                if c.post_count < min_posts: continue
            if skip_private and c.is_private: continue
            if skip_business and c.is_business: continue
            if c.username.lower() in blacklist: continue
            out.append(c)
        return out
