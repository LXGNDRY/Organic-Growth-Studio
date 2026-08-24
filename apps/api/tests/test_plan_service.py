import pytest
from app.services.plan_service import PLANS, can_add_account, get_plan, max_daily_actions, plan_has_feature, public_plans

class TestPlanService:
    def test_all_plans_exist(self):
        for t in ["starter", "growth", "scale", "agency", "enterprise"]:
            assert t in PLANS

    def test_get_plan(self):
        assert get_plan("growth").tier == "growth"

    def test_get_plan_invalid(self):
        with pytest.raises(ValueError):
            get_plan("nonexistent")

    def test_budget_increases(self):
        tiers = ["starter", "growth", "scale", "agency", "enterprise"]
        budgets = [max_daily_actions(t) for t in tiers]
        for i in range(len(budgets) - 1):
            assert budgets[i + 1] >= budgets[i]

    def test_can_add_account(self):
        assert can_add_account("starter", 0) is True
        assert can_add_account("starter", 1) is False

    def test_soc2_feature(self):
        assert plan_has_feature("starter", "has_soc2_report") is False
        assert plan_has_feature("scale", "has_soc2_report") is True

    def test_public_plans(self):
        tiers = [p.tier for p in public_plans()]
        assert "enterprise" not in tiers
        assert len(tiers) == 4
