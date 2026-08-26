import pytest

from src.execution import (
    ActionExecutor,
    ActionStatus,
    ExecutionResult,
    IGBlockDetector,
    InstagramClient,
)


class TestDryRunSafety:
    def test_defaults_to_dry_run(self):
        ex = ActionExecutor(account_id="a1")
        assert ex.dry_run is True

    def test_live_mode_requires_a_real_client(self):
        with pytest.raises(ValueError):
            ActionExecutor(account_id="a1", dry_run=False)

    @pytest.mark.asyncio
    async def test_dry_run_never_touches_the_live_client(self):
        class ExplodingClient(InstagramClient):
            async def like(self, target_id, media_id):
                raise AssertionError("dry-run must not call the live client")

        ex = ActionExecutor(account_id="a1", client=ExplodingClient(), dry_run=True)
        result = await ex.like("t1", "m1")
        assert result.dry_run is True

    @pytest.mark.asyncio
    async def test_live_mode_uses_the_provided_client(self):
        calls = []

        class RecordingClient(InstagramClient):
            async def like(self, target_id, media_id):
                calls.append((target_id, media_id))
                return ExecutionResult(success=True, status=ActionStatus.COMPLETED, http_status=200)

        ex = ActionExecutor(account_id="a1", client=RecordingClient(), dry_run=False)
        result = await ex.like("t1", "m1")
        assert calls == [("t1", "m1")]
        assert result.dry_run is False


class TestBlockDetection:
    def test_success_is_clean(self):
        r = ExecutionResult(success=True, status=ActionStatus.COMPLETED, http_status=200)
        assert IGBlockDetector.classify(r) is None

    @pytest.mark.parametrize("code", ["checkpoint_required", "feedback_required", "action_blocked", "challenge_required"])
    def test_hard_block_error_codes(self, code):
        r = ExecutionResult(success=False, status=ActionStatus.BLOCKED, error_code=code)
        assert IGBlockDetector.classify(r) == "hard"

    @pytest.mark.parametrize("status", [400, 403])
    def test_hard_block_http_statuses(self, status):
        r = ExecutionResult(success=False, status=ActionStatus.BLOCKED, http_status=status)
        assert IGBlockDetector.classify(r) == "hard"

    def test_soft_block_rate_limit(self):
        r = ExecutionResult(success=False, status=ActionStatus.RATE_LIMITED, http_status=429, error_code="rate_limited")
        assert IGBlockDetector.classify(r) == "soft"

    def test_unknown_failure_is_conservatively_soft(self):
        r = ExecutionResult(success=False, status=ActionStatus.FAILED, error_code="unknown_error")
        assert IGBlockDetector.classify(r) == "soft"
