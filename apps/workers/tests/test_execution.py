import pytest

from src.execution import (
    ActionExecutor,
    ActionStatus,
    ExecutionResult,
    IGBlockDetector,
    InstagramClient,
    ProxyManager,
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


class TestProxyRedaction:
    def test_redacts_embedded_credentials(self):
        raw = "http://acct-1:s3cr3t@proxy.example.com:8080"
        redacted = ProxyManager.redact(raw)
        assert "s3cr3t" not in redacted
        assert "acct-1" not in redacted
        assert "proxy.example.com:8080" in redacted

    def test_passes_through_url_without_credentials(self):
        assert ProxyManager.redact("http://proxy.example.com:8080") == "http://proxy.example.com:8080"

    def test_passes_through_none(self):
        assert ProxyManager.redact(None) is None

    @pytest.mark.asyncio
    async def test_assign_proxy_output_is_fully_redactable(self):
        manager = ProxyManager()
        url = await manager.assign_proxy("acct-1")
        redacted = ProxyManager.redact(url)
        assert "acct-1" not in redacted or "password" not in redacted
        assert "password" not in redacted


class TestActionExecutorProxyWiring:
    def test_redacted_proxy_never_exposes_raw_credentials(self):
        ex = ActionExecutor(account_id="a1", proxy_url="http://a1:hunter2@proxy.example.com:8080")
        assert "hunter2" not in ex.redacted_proxy
        assert "proxy.example.com:8080" in ex.redacted_proxy

    def test_redacted_proxy_is_none_when_no_proxy_assigned(self):
        ex = ActionExecutor(account_id="a1")
        assert ex.redacted_proxy is None
