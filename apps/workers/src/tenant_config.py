"""Reads a tenant's real, per-account TargetingConfig from the SaaS schema
that `apps/api/app/db/models.py` owns.

Workers and the API are separate deployable services but share one
Postgres database (see both apps' `.env.example`: `DATABASE_URL` points at
the same `instagro` database), so the schema itself — table and column
names — is the integration contract, not apps/api's ORM code. This module
mirrors just the one table (`targeting_configs`) workers needs to read, as
plain SQLAlchemy Core `Table` objects, deliberately without importing
`app.db.models` — that would couple two independently-deployed services'
Python packaging together for a single read.

Before this module existed, `src/main.py` always ran every account against
a single hardcoded `DEFAULT_TARGETING_CONFIG` dict — there was no way for a
tenant's actual, dashboard-configured targeting rules to ever reach the
engine. `load_tenant_targeting_config` closes that gap: an account with a
provisioned `targeting_configs` row gets its real config; an account with
none (not yet provisioned, or a local demo/dry-run id that isn't even a
real UUID) falls back to `DEFAULT_TARGETING_CONFIG`, preserving today's
dry-run behavior exactly.
"""
from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, Column, Float, Integer, MetaData, String, Table, select
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncEngine

_metadata = MetaData()

# Column set mirrors apps/api/app/db/models.py:TargetingConfig exactly for
# every field the worker actually consumes (discovery filters, pacing daily
# limits, active hours, unfollow-after-days). `competitors`/`hashtags`/
# `locations` are omitted: apps/workers has no consumer for them yet (real
# Instagram sourcing isn't built — see apps/workers/README.md).
_targeting_configs = Table(
    "targeting_configs",
    _metadata,
    Column("account_id", UUID(as_uuid=True)),
    Column("min_followers", Integer),
    Column("max_followers", Integer),
    Column("min_following", Integer),
    Column("max_following", Integer),
    Column("min_posts", Integer),
    Column("gender", String),
    Column("languages", JSON),
    Column("enabled_actions", JSON),
    Column("daily_like_limit", Integer),
    Column("daily_follow_limit", Integer),
    Column("daily_unfollow_limit", Integer),
    Column("daily_story_view_limit", Integer),
    Column("daily_comment_limit", Integer),
    Column("follow_back_ratio_min", Float),
    Column("follow_back_ratio_max", Float),
    Column("active_hours", JSON),
    Column("unfollow_after_days", Integer),
    Column("skip_private_accounts", Boolean),
    Column("skip_business_accounts", Boolean),
    Column("blacklisted_usernames", JSON),
)

# Columns that feed DEFAULT_TARGETING_CONFIG-shaped dicts directly.
# `active_hours`/`unfollow_after_days` are handled separately by callers
# (main.py applies active_hours via PacingConfig.with_active_hours_override
# and reads unfollow_after_days on its own — see load_tenant_targeting_config's
# docstring below).
_FILTER_AND_LIMIT_COLUMNS = (
    "min_followers", "max_followers", "min_following", "max_following", "min_posts",
    "gender", "languages", "enabled_actions",
    "daily_like_limit", "daily_follow_limit", "daily_unfollow_limit",
    "daily_story_view_limit", "daily_comment_limit",
    "follow_back_ratio_min", "follow_back_ratio_max",
    "skip_private_accounts", "skip_business_accounts", "blacklisted_usernames",
)


async def load_tenant_targeting_config(
    engine: AsyncEngine | Engine, account_id: str,
) -> dict | None:
    """Returns the real TargetingConfig for `account_id`, or None.

    `account_id` must be a valid UUID (an `instagram_accounts.id`) to match
    anything — a non-UUID id (e.g. a local demo account name) can never
    have a real SaaS-provisioned config, so this returns None immediately
    rather than issuing a query. None is also returned if the account has
    no `targeting_configs` row yet, or if the table doesn't exist at all
    (e.g. apps/api's migrations haven't been run against this database) —
    a missing SaaS table must never crash the worker.

    The returned dict has the same shape as `DEFAULT_TARGETING_CONFIG`
    (same keys, e.g. `daily_like_limit`) plus `active_hours` and
    `unfollow_after_days`, which callers consume separately.
    """
    try:
        account_uuid = uuid.UUID(account_id)
    except ValueError:
        return None

    query = select(_targeting_configs).where(_targeting_configs.c.account_id == account_uuid)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(query)
            row = result.mappings().first()
    except (ProgrammingError, DBAPIError):
        # Undefined table/relation — the SaaS schema isn't migrated into
        # this database yet. Same fallback as "no row found".
        return None

    if row is None:
        return None

    config = {key: row[key] for key in _FILTER_AND_LIMIT_COLUMNS}
    config["active_hours"] = row["active_hours"]
    config["unfollow_after_days"] = row["unfollow_after_days"]
    return config
