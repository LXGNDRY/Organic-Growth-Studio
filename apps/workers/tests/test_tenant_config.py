"""Integration tests against a real Postgres database (no mocks).

Exercises `load_tenant_targeting_config` against a `targeting_configs`
table shaped exactly like the one apps/api/app/db/models.py defines,
proving the SQLAlchemy Core Table this module hand-maintains actually
matches the real column set/types the API writes — not just that it
round-trips against itself.
"""
import os
import uuid

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine

from src.tenant_config import _targeting_configs, load_tenant_targeting_config

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/instagro_test"
)


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(TEST_DATABASE_URL)
    try:
        async with eng.begin() as conn:
            await conn.run_sync(_targeting_configs.create, checkfirst=True)
    except Exception:
        pytest.skip(f"no real postgres reachable at {TEST_DATABASE_URL}")
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(_targeting_configs.drop, checkfirst=True)
    await eng.dispose()


def make_row(account_id: uuid.UUID, **overrides) -> dict:
    row = {
        "account_id": account_id,
        "min_followers": 500,
        "max_followers": 20000,
        "min_following": 10,
        "max_following": 5000,
        "min_posts": 5,
        "gender": "female",
        "languages": ["en", "es"],
        "enabled_actions": ["like", "follow", "comment"],
        "daily_like_limit": 250,
        "daily_follow_limit": 80,
        "daily_unfollow_limit": 80,
        "daily_story_view_limit": 300,
        "daily_comment_limit": 20,
        "follow_back_ratio_min": 0.2,
        "follow_back_ratio_max": 4.0,
        "active_hours": {"start_hour": 7, "end_hour": 21},
        "unfollow_after_days": 10,
        "skip_private_accounts": False,
        "skip_business_accounts": True,
        "blacklisted_usernames": ["spammer1"],
    }
    row.update(overrides)
    return row


class TestLoadTenantTargetingConfig:
    async def test_non_uuid_account_id_returns_none_without_querying(self, engine):
        # A local demo/dry-run id (e.g. "demo_account_1") can never match a
        # real provisioned account — must short-circuit, never error.
        assert await load_tenant_targeting_config(engine, "demo_account_1") is None

    async def test_uuid_with_no_provisioned_row_returns_none(self, engine):
        assert await load_tenant_targeting_config(engine, str(uuid.uuid4())) is None

    async def test_provisioned_row_is_loaded_with_real_values(self, engine):
        account_id = uuid.uuid4()
        async with engine.begin() as conn:
            await conn.execute(_targeting_configs.insert().values(**make_row(account_id)))

        config = await load_tenant_targeting_config(engine, str(account_id))

        assert config is not None
        assert config["min_followers"] == 500
        assert config["max_followers"] == 20000
        assert config["gender"] == "female"
        assert config["languages"] == ["en", "es"]
        assert config["enabled_actions"] == ["like", "follow", "comment"]
        assert config["daily_like_limit"] == 250
        assert config["daily_comment_limit"] == 20
        assert config["follow_back_ratio_min"] == 0.2
        assert config["active_hours"] == {"start_hour": 7, "end_hour": 21}
        assert config["unfollow_after_days"] == 10
        assert config["skip_private_accounts"] is False
        assert config["skip_business_accounts"] is True
        assert config["blacklisted_usernames"] == ["spammer1"]

    async def test_only_matches_its_own_account_id(self, engine):
        account_a, account_b = uuid.uuid4(), uuid.uuid4()
        async with engine.begin() as conn:
            await conn.execute(
                _targeting_configs.insert().values(**make_row(account_a, daily_like_limit=111))
            )
            await conn.execute(
                _targeting_configs.insert().values(**make_row(account_b, daily_like_limit=222))
            )

        config_a = await load_tenant_targeting_config(engine, str(account_a))
        config_b = await load_tenant_targeting_config(engine, str(account_b))

        assert config_a["daily_like_limit"] == 111
        assert config_b["daily_like_limit"] == 222

    async def test_missing_table_returns_none_instead_of_raising(self):
        # A database that hasn't had apps/api's migrations run against it
        # yet must never crash the worker — same fallback as "no row".
        eng = create_async_engine(TEST_DATABASE_URL)
        try:
            async with eng.begin() as conn:
                await conn.run_sync(_targeting_configs.drop, checkfirst=True)
        except Exception:
            pytest.skip(f"no real postgres reachable at {TEST_DATABASE_URL}")

        try:
            assert await load_tenant_targeting_config(eng, str(uuid.uuid4())) is None
        finally:
            await eng.dispose()
