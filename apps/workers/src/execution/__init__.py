import time, random
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

class ActionType(str, Enum):
    LIKE = "like"; FOLLOW = "follow"; UNFOLLOW = "unfollow"
    STORY_VIEW = "story_view"; COMMENT = "comment"

class ActionStatus(str, Enum):
    PENDING = "pending"; EXECUTING = "executing"; COMPLETED = "completed"
    FAILED = "failed"; SKIPPED = "skipped"; RATE_LIMITED = "rate_limited"; BLOCKED = "blocked"

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

class ActionExecutor:
    """Executes engagement actions against Instagram.

    Skeleton implementation — in production this wraps residential proxies,
    device fingerprint simulation, and HTTP/Playwright-based execution.
    """
    def __init__(self, account_id: str, proxy_url: str | None = None):
        self.account_id = account_id
        self.proxy_url = proxy_url
        self.session_active = False

    async def like(self, target_id: str, media_id: str) -> ExecutionResult:
        return self._simulate(ActionType.LIKE)

    async def follow(self, target_id: str, target_username: str) -> ExecutionResult:
        return self._simulate(ActionType.FOLLOW)

    async def unfollow(self, target_id: str, target_username: str) -> ExecutionResult:
        return self._simulate(ActionType.UNFOLLOW)

    def _simulate(self, action: ActionType) -> ExecutionResult:
        start = time.time()
        time.sleep(random.uniform(0.1, 0.5))
        success = random.random() < 0.95
        dur = int((time.time() - start) * 1000)
        if success:
            return ExecutionResult(success=True, status=ActionStatus.COMPLETED, http_status=200, duration_ms=dur, executed_at=datetime.now(timezone.utc))
        ft = random.choice(["rate_limit", "network", "unknown"])
        if ft == "rate_limit":
            return ExecutionResult(success=False, status=ActionStatus.RATE_LIMITED, http_status=429, duration_ms=dur, error_code="rate_limited", executed_at=datetime.now(timezone.utc))
        else:
            return ExecutionResult(success=False, status=ActionStatus.FAILED, duration_ms=dur, error_code="unknown_error", error_message="Unknown error", executed_at=datetime.now(timezone.utc))

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
