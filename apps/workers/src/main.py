import asyncio, structlog
from datetime import datetime, timezone
from src.config import get_settings
from src.pacing import PacingConfig, PacingController
from src.execution import ActionExecutor

settings = get_settings()
logger = structlog.get_logger()

class EngagementWorker:
    def __init__(self, account_id: str):
        self.account_id = account_id
        self.running = False
        self.pacing: PacingController | None = None
        self.executor: ActionExecutor | None = None

    async def start(self) -> None:
        self.running = True
        logger.info("worker.started", account_id=self.account_id)
        import redis.asyncio as redis
        r = redis.from_url(settings.redis_url)
        self.pacing = PacingController(redis_client=r, account_id=self.account_id, config=PacingConfig())
        self.executor = ActionExecutor(account_id=self.account_id)
        await self._run_loop()

    async def stop(self) -> None:
        self.running = False
        logger.info("worker.stopped", account_id=self.account_id)

    async def _run_loop(self) -> None:
        while self.running:
            try: await self._tick()
            except Exception as e:
                logger.exception("worker.tick_error", account_id=self.account_id, error=str(e))
                await asyncio.sleep(10)

    async def _tick(self) -> None:
        if not self.pacing or not self.executor:
            await asyncio.sleep(5); return
        if self.pacing.is_throttled:
            logger.info("worker.throttled", account_id=self.account_id, blocks=self.pacing.consecutive_blocks)
            await asyncio.sleep(60); return
        if not self.pacing.is_active_hours:
            await asyncio.sleep(300); return
        if await self.pacing.consume_token("like"):  # type: ignore[arg-type]
            result = await self.executor.like(target_id="placeholder", media_id="placeholder")
            if result.success: self.pacing.record_success()
            else:
                sev = "hard" if result.status.value == "blocked" else "soft"
                self.pacing.record_block(severity=sev)
            logger.info("worker.action_executed", account_id=self.account_id, action_type="like", success=result.success, status=result.status.value, risk_score=self.pacing.risk_score())
        delay = self.pacing.next_action_delay()
        await asyncio.sleep(delay)

async def main():
    import sys
    if len(sys.argv) < 2:
        print("Usage: python -m src.main <account_id>"); sys.exit(1)
    w = EngagementWorker(sys.argv[1])
    await w.start()

if __name__ == "__main__":
    asyncio.run(main())
