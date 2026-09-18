import pytest

from src.discovery import DiscoveredAccount, TargetDiscoveryService, TargetSource

pytestmark = pytest.mark.asyncio


def make_account(username: str, **overrides) -> DiscoveredAccount:
    defaults = dict(
        username=username, instagram_id=f"ig_{username}", source=TargetSource.HASHTAG_ENGAGERS,
        source_ref="#test", follower_count=1000, following_count=500, post_count=50,
        is_private=False, is_business=False,
    )
    defaults.update(overrides)
    return DiscoveredAccount(**defaults)


class TestDiscoverInertByDefault:
    async def test_non_simulated_discover_returns_nothing(self):
        service = TargetDiscoveryService(simulated=False)
        result = await service.discover("acct-1", {}, max_candidates=50)
        assert result == []

    async def test_simulated_discover_returns_candidates(self):
        service = TargetDiscoveryService(simulated=True)
        result = await service.discover("acct-1", {"min_followers": 0, "max_followers": 100000}, max_candidates=10)
        assert len(result) == 10
        assert all(isinstance(c, DiscoveredAccount) for c in result)


class TestFilterByCriteria:
    async def test_follower_range_is_enforced(self):
        service = TargetDiscoveryService()
        # following_count=1200 keeps "mid"'s follower/following ratio (≈4.17)
        # within the default follow_back_ratio bounds (0.1-5.0), so this test
        # isolates the follower-range check rather than also tripping the
        # ratio filter.
        candidates = [
            make_account("low", follower_count=10),
            make_account("mid", follower_count=5000, following_count=1200),
            make_account("high", follower_count=999999),
        ]
        out = await service.filter_by_criteria(candidates, {"min_followers": 100, "max_followers": 50000})
        assert [c.username for c in out] == ["mid"]

    async def test_private_accounts_skipped_by_default(self):
        service = TargetDiscoveryService()
        candidates = [make_account("pub", is_private=False), make_account("priv", is_private=True)]
        out = await service.filter_by_criteria(candidates, {"min_followers": 0, "max_followers": 100000})
        assert [c.username for c in out] == ["pub"]

    async def test_private_accounts_kept_when_not_skipped(self):
        service = TargetDiscoveryService()
        candidates = [make_account("pub", is_private=False), make_account("priv", is_private=True)]
        out = await service.filter_by_criteria(candidates, {"min_followers": 0, "max_followers": 100000, "skip_private_accounts": False})
        assert {c.username for c in out} == {"pub", "priv"}

    async def test_business_accounts_skipped_when_configured(self):
        service = TargetDiscoveryService()
        candidates = [make_account("creator", is_business=False), make_account("brand", is_business=True)]
        out = await service.filter_by_criteria(candidates, {"min_followers": 0, "max_followers": 100000, "skip_business_accounts": True})
        assert [c.username for c in out] == ["creator"]

    async def test_business_accounts_kept_by_default(self):
        service = TargetDiscoveryService()
        candidates = [make_account("creator", is_business=False), make_account("brand", is_business=True)]
        out = await service.filter_by_criteria(candidates, {"min_followers": 0, "max_followers": 100000})
        assert {c.username for c in out} == {"creator", "brand"}

    async def test_blacklisted_usernames_are_excluded(self):
        service = TargetDiscoveryService()
        candidates = [make_account("keepme"), make_account("blockme")]
        out = await service.filter_by_criteria(
            candidates, {"min_followers": 0, "max_followers": 100000, "blacklisted_usernames": ["blockme"]}
        )
        assert [c.username for c in out] == ["keepme"]

    async def test_blacklist_match_is_case_insensitive(self):
        service = TargetDiscoveryService()
        candidates = [make_account("BlockMe")]
        out = await service.filter_by_criteria(
            candidates, {"min_followers": 0, "max_followers": 100000, "blacklisted_usernames": ["blockme"]}
        )
        assert out == []

    async def test_following_range_is_enforced(self):
        service = TargetDiscoveryService()
        candidates = [
            make_account("low", following_count=5),
            make_account("mid", following_count=500),
            make_account("high", following_count=999999),
        ]
        out = await service.filter_by_criteria(
            candidates, {"min_followers": 0, "max_followers": 100000, "min_following": 50, "max_following": 10000}
        )
        assert [c.username for c in out] == ["mid"]

    async def test_min_posts_is_enforced(self):
        service = TargetDiscoveryService()
        candidates = [make_account("empty", post_count=0), make_account("active", post_count=50)]
        out = await service.filter_by_criteria(
            candidates, {"min_followers": 0, "max_followers": 100000, "min_posts": 3}
        )
        assert [c.username for c in out] == ["active"]

    async def test_following_and_posts_filters_default_to_wide_open(self):
        # Defaults (min_following=0, max_following=10000, min_posts=3) mirror
        # TargetingConfig's own defaults — a candidate that matches those
        # should pass through when the caller doesn't override them.
        service = TargetDiscoveryService()
        candidates = [make_account("typical", following_count=500, post_count=50)]
        out = await service.filter_by_criteria(candidates, {"min_followers": 0, "max_followers": 100000})
        assert [c.username for c in out] == ["typical"]

    async def test_follow_back_ratio_bounds_are_enforced(self):
        service = TargetDiscoveryService()
        candidates = [
            make_account("toolopsided", follower_count=10000, following_count=100),  # ratio 100, way above max
            make_account("reasonable", follower_count=2000, following_count=500),  # ratio 4.0
            make_account("desperate", follower_count=10, following_count=1000),  # ratio 0.01, below min
        ]
        out = await service.filter_by_criteria(
            candidates, {"min_followers": 0, "max_followers": 100000, "follow_back_ratio_min": 0.1, "follow_back_ratio_max": 5.0}
        )
        assert [c.username for c in out] == ["reasonable"]

    async def test_follow_back_ratio_skipped_when_following_count_unknown(self):
        service = TargetDiscoveryService()
        candidates = [make_account("nodata", following_count=0)]
        out = await service.filter_by_criteria(
            candidates, {"min_followers": 0, "max_followers": 100000, "follow_back_ratio_min": 0.1, "follow_back_ratio_max": 5.0}
        )
        # following_count=0 makes the ratio unevaluable, not a disqualifier
        assert [c.username for c in out] == ["nodata"]
