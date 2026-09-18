"""Guards against DEFAULT_TARGETING_CONFIG silently missing a config key.

Codex flagged that skip_business_accounts/blacklisted_usernames were added
to filter_by_criteria but never reached the one real entrypoint
(src/main.py), because DEFAULT_TARGETING_CONFIG didn't carry them. This
test would have caught that: every filter key filter_by_criteria supports,
and every key EngagementEngine._resolve_action_types reads, must appear in
DEFAULT_TARGETING_CONFIG, or it can never be activated by the CLI as it
exists today.
"""
from src.main import DEFAULT_TARGETING_CONFIG

# Keys `TargetDiscoveryService.filter_by_criteria` reads via `cfg.get(...)`.
FILTER_KEYS_SUPPORTED_BY_DISCOVERY = {
    "min_followers",
    "max_followers",
    "min_following",
    "max_following",
    "min_posts",
    "follow_back_ratio_min",
    "follow_back_ratio_max",
    "skip_private_accounts",
    "skip_business_accounts",
    "blacklisted_usernames",
    "gender",
    "languages",
}

# Keys `EngagementEngine._resolve_action_types` reads via `cfg.get(...)`.
ACTION_KEYS_SUPPORTED_BY_ENGINE = {"enabled_actions"}

# Keys `PacingConfig.with_daily_limits_override` reads via `cfg.get(...)`.
DAILY_LIMIT_KEYS_SUPPORTED_BY_PACING = {
    "daily_like_limit",
    "daily_follow_limit",
    "daily_unfollow_limit",
    "daily_story_view_limit",
    "daily_comment_limit",
}


def test_default_targeting_config_covers_every_discovery_filter_key():
    missing = FILTER_KEYS_SUPPORTED_BY_DISCOVERY - DEFAULT_TARGETING_CONFIG.keys()
    assert not missing, f"DEFAULT_TARGETING_CONFIG is missing filter keys: {missing}"


def test_default_targeting_config_covers_every_engine_action_key():
    missing = ACTION_KEYS_SUPPORTED_BY_ENGINE - DEFAULT_TARGETING_CONFIG.keys()
    assert not missing, f"DEFAULT_TARGETING_CONFIG is missing action-gating keys: {missing}"


def test_default_targeting_config_covers_every_daily_limit_key():
    missing = DAILY_LIMIT_KEYS_SUPPORTED_BY_PACING - DEFAULT_TARGETING_CONFIG.keys()
    assert not missing, f"DEFAULT_TARGETING_CONFIG is missing daily-limit keys: {missing}"


def test_default_targeting_config_matches_api_model_defaults():
    # Mirrors apps/api/app/db/models.py TargetingConfig defaults, so a
    # dry-run account behaves like a freshly-provisioned tenant would.
    assert DEFAULT_TARGETING_CONFIG["skip_private_accounts"] is True
    assert DEFAULT_TARGETING_CONFIG["skip_business_accounts"] is False
    assert DEFAULT_TARGETING_CONFIG["blacklisted_usernames"] == []
    assert DEFAULT_TARGETING_CONFIG["enabled_actions"] == ["like", "follow"]
    assert DEFAULT_TARGETING_CONFIG["min_following"] == 0
    assert DEFAULT_TARGETING_CONFIG["max_following"] == 10000
    assert DEFAULT_TARGETING_CONFIG["min_posts"] == 3
    assert DEFAULT_TARGETING_CONFIG["follow_back_ratio_min"] == 0.1
    assert DEFAULT_TARGETING_CONFIG["follow_back_ratio_max"] == 5.0
    assert DEFAULT_TARGETING_CONFIG["gender"] == "any"
    assert DEFAULT_TARGETING_CONFIG["languages"] == []
    assert DEFAULT_TARGETING_CONFIG["daily_like_limit"] == 200
    assert DEFAULT_TARGETING_CONFIG["daily_follow_limit"] == 100
    assert DEFAULT_TARGETING_CONFIG["daily_unfollow_limit"] == 100
    assert DEFAULT_TARGETING_CONFIG["daily_story_view_limit"] == 500
    assert DEFAULT_TARGETING_CONFIG["daily_comment_limit"] == 0
