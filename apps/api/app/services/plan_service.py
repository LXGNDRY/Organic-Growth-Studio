from dataclasses import dataclass

@dataclass(frozen=True)
class PlanEntitlements:
    tier: str
    display_name: str
    price_monthly: int
    price_annual: int
    daily_action_budget: int
    max_accounts: int
    ai_quality_scoring: str
    support_level: str
    has_soc2_report: bool
    has_custom_pacing: bool
    has_white_label: bool
    has_api_access: bool

PLANS = {
    "starter": PlanEntitlements("starter", "Starter", 39, 390, 250, 1, "basic", "email", False, False, False, False),
    "growth": PlanEntitlements("growth", "Growth", 79, 790, 600, 3, "advanced", "priority", False, False, False, False),
    "scale": PlanEntitlements("scale", "Scale", 149, 1490, 1200, 10, "realtime", "chat", True, True, False, True),
    "agency": PlanEntitlements("agency", "Agency", 299, 2990, 4000, 25, "realtime", "account_manager", True, True, True, True),
    "enterprise": PlanEntitlements("enterprise", "Enterprise", 0, 0, 100000, 9999, "custom", "dedicated_se", True, True, True, True),
}

def get_plan(tier: str) -> PlanEntitlements:
    if tier not in PLANS: raise ValueError(f"Unknown plan: {tier}")
    return PLANS[tier]

def plan_has_feature(tier: str, feature: str) -> bool:
    return bool(getattr(get_plan(tier), feature, False))

def can_add_account(tier: str, current: int) -> bool:
    return current < get_plan(tier).max_accounts

def max_daily_actions(tier: str) -> int:
    return get_plan(tier).daily_action_budget

def public_plans() -> list[PlanEntitlements]:
    return [PLANS["starter"], PLANS["growth"], PLANS["scale"], PLANS["agency"]]
