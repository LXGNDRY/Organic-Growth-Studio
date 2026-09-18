"""Execution layer — the only code path allowed to touch Instagram.

Safety invariant: `ActionExecutor` never runs live against Instagram unless
constructed with `dry_run=False` *explicitly*. Every constructor call site
in this codebase must default to dry-run; flipping to live traffic is a
one-line, auditable decision made by the caller, never an implicit default.
"""
import random
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timezone
from enum import Enum


class ActionType(str, Enum):
    LIKE = "like"
    FOLLOW = "follow"
    UNFOLLOW = "unfollow"
    STORY_VIEW = "story_view"
    COMMENT = "comment"


class ActionStatus(str, Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    RATE_LIMITED = "rate_limited"
    BLOCKED = "blocked"


@dataclass
class ExecutionResult:
    success: bool
    status: ActionStatus
    http_status: int | None = None
    duration_ms: int = 0
    error_code: str | None = None
    error_message: str | None = None
    followed_back: bool | None = None
    executed_at: datetime | None = None
    dry_run: bool = True


# HTTP/error signals that indicate Instagram is actively pushing back on this
# account, as opposed to a transient network blip. These must always be
# classified as a "block" so the pacing controller throttles immediately —
# see IGBlockDetector below. This is the enforcement point for the hard rule
# "any Instagram block/error signal triggers immediate throttling".
HARD_BLOCK_HTTP_STATUSES = {400, 403}
SOFT_BLOCK_HTTP_STATUSES = {429}
HARD_BLOCK_ERROR_CODES = {
    "checkpoint_required",
    "feedback_required",
    "action_blocked",
    "challenge_required",
}
SOFT_BLOCK_ERROR_CODES = {"rate_limited", "spam_detected"}


class IGBlockDetector:
    """Classifies a raw execution outcome as clean / soft-block / hard-block.

    Kept as its own object (rather than inline logic in the executor) so the
    engine's pipeline can call it against *any* result — real or simulated —
    and so the classification rules are unit-testable in isolation from
    network behavior.
    """

    @staticmethod
    def classify(result: "ExecutionResult") -> str | None:
        """Returns None (clean), "soft", or "hard"."""
        if result.success:
            return None
        if result.error_code in HARD_BLOCK_ERROR_CODES or result.http_status in HARD_BLOCK_HTTP_STATUSES:
            return "hard"
        if result.error_code in SOFT_BLOCK_ERROR_CODES or result.http_status in SOFT_BLOCK_HTTP_STATUSES:
            return "soft"
        return "soft"  # unknown failures are treated conservatively, never ignored


class InstagramClient:
    """Thin seam over the real Instagram transport.

    Production wires this to residential proxies + device fingerprinting +
    HTTP/Playwright execution. It is intentionally not implemented here —
    the engine must work correctly with *any* implementation of this
    interface, including a fully mocked one, which is what makes it safe to
    validate end-to-end before real credentials are involved.
    """

    async def like(self, target_id: str, media_id: str) -> ExecutionResult:
        raise NotImplementedError("wire a real Instagram transport before going live")

    async def follow(self, target_id: str, target_username: str) -> ExecutionResult:
        raise NotImplementedError("wire a real Instagram transport before going live")

    async def unfollow(self, target_id: str, target_username: str) -> ExecutionResult:
        raise NotImplementedError("wire a real Instagram transport before going live")


class SimulatedInstagramClient(InstagramClient):
    """Deterministic-ish fake transport used for dry-run mode and tests."""

    def __init__(self, success_rate: float = 0.95, seed: random.Random | None = None):
        self.success_rate = success_rate
        self._rng = seed or random.Random()

    async def like(self, target_id: str, media_id: str) -> ExecutionResult:
        return self._simulate(ActionType.LIKE)

    async def follow(self, target_id: str, target_username: str) -> ExecutionResult:
        return self._simulate(ActionType.FOLLOW)

    async def unfollow(self, target_id: str, target_username: str) -> ExecutionResult:
        return self._simulate(ActionType.UNFOLLOW)

    def _simulate(self, action: ActionType) -> ExecutionResult:
        start = time.time()
        success = self._rng.random() < self.success_rate
        dur = int((time.time() - start) * 1000)
        if success:
            return ExecutionResult(
                success=True, status=ActionStatus.COMPLETED, http_status=200,
                duration_ms=dur, executed_at=datetime.now(UTC), dry_run=True,
            )
        fault = self._rng.choice(["rate_limit", "network", "unknown"])
        if fault == "rate_limit":
            return ExecutionResult(
                success=False, status=ActionStatus.RATE_LIMITED, http_status=429,
                duration_ms=dur, error_code="rate_limited",
                executed_at=datetime.now(UTC), dry_run=True,
            )
        return ExecutionResult(
            success=False, status=ActionStatus.FAILED, duration_ms=dur,
            error_code="unknown_error", error_message="Unknown error",
            executed_at=datetime.now(UTC), dry_run=True,
        )


class ActionExecutor:
    """Executes engagement actions, defaulting to dry-run (simulated) mode.

    `dry_run=True` (the default) routes every call through
    `SimulatedInstagramClient` regardless of what `client` is passed, so a
    caller cannot accidentally go live by forgetting to swap the client —
    they must also flip `dry_run=False`.
    """

    def __init__(self, account_id: str, client: InstagramClient | None = None, dry_run: bool = True, proxy_url: str | None = None):
        self.account_id = account_id
        self.dry_run = dry_run
        self._live_client = client
        self._sim_client = SimulatedInstagramClient()
        self.proxy_url = proxy_url
        if not dry_run and client is None:
            raise ValueError("a real InstagramClient is required when dry_run=False")

    @property
    def redacted_proxy(self) -> str | None:
        """Safe-for-logs form of the assigned proxy — never the raw URL."""
        return ProxyManager.redact(self.proxy_url)

    @property
    def _client(self) -> InstagramClient:
        return self._sim_client if self.dry_run else self._live_client  # type: ignore[return-value]

    async def like(self, target_id: str, media_id: str) -> ExecutionResult:
        result = await self._client.like(target_id, media_id)
        result.dry_run = self.dry_run
        return result

    async def follow(self, target_id: str, target_username: str) -> ExecutionResult:
        result = await self._client.follow(target_id, target_username)
        result.dry_run = self.dry_run
        return result

    async def unfollow(self, target_id: str, target_username: str) -> ExecutionResult:
        result = await self._client.unfollow(target_id, target_username)
        result.dry_run = self.dry_run
        return result


class ProxyManager:
    """Manages residential proxy assignment (one per account)."""

    def __init__(self, provider: str = "brightdata"):
        self.provider = provider
        self._account_proxies: dict[str, str] = {}

    async def get_proxy_for_account(self, account_id: str) -> str | None:
        return self._account_proxies.get(account_id)

    async def assign_proxy(self, account_id: str, country: str = "US") -> str:
        url = f"http://{account_id}:password@proxy.example.com:8080"
        self._account_proxies[account_id] = url
        return url

    @staticmethod
    def redact(proxy_url: str | None) -> str | None:
        """Strips embedded credentials from a proxy URL for safe logging.

        A proxy URL is exactly the kind of secret the hard rule "never log
        credentials" covers — `assign_proxy` embeds one directly in the
        URL — so this is the only form of it that should ever reach a log
        line or audit record.
        """
        if not proxy_url:
            return proxy_url
        if "@" not in proxy_url:
            return proxy_url
        scheme_sep = proxy_url.find("://")
        prefix = proxy_url[: scheme_sep + 3] if scheme_sep != -1 else ""
        rest = proxy_url[len(prefix) :]
        _, _, host = rest.partition("@")
        return f"{prefix}***:***@{host}"
