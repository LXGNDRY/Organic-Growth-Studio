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
    "skip_private_accounts",
    "skip_business_accounts",
    "blacklisted_usernames",
}

# Keys `EngagementEngine._resolve_action_types` reads via `cfg.get(...)`.
ACTION_KEYS_SUPPORTED_BY_ENGINE = {"enabled_actions"}


def test_default_targeting_config_covers_every_discovery_filter_key():
    missing = FILTER_KEYS_SUPPORTED_BY_DISCOVERY - DEFAULT_TARGETING_CONFIG.keys()
    assert not missing, f"DEFAULT_TARGETING_CONFIG is missing filter keys: {missing}"


def test_default_targeting_config_covers_every_engine_action_key():
    missing = ACTION_KEYS_SUPPORTED_BY_ENGINE - DEFAULT_TARGETING_CONFIG.keys()
    assert not missing, f"DEFAULT_TARGETING_CONFIG is missing action-gating keys: {missing}"


def test_default_targeting_config_matches_api_model_defaults():
    # Mirrors apps/api/app/db/models.py TargetingConfig defaults, so a
    # dry-run account behaves like a freshly-provisioned tenant would.
    assert DEFAULT_TARGETING_CONFIG["skip_private_accounts"] is True
    assert DEFAULT_TARGETING_CONFIG["skip_business_accounts"] is False
    assert DEFAULT_TARGETING_CONFIG["blacklisted_usernames"] == []
    assert DEFAULT_TARGETING_CONFIG["enabled_actions"] == ["like", "follow"]
