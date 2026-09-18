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
        candidates = [make_account("low", follower_count=10), make_account("mid", follower_count=5000), make_account("high", follower_count=999999)]
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
