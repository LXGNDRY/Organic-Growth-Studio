import os

import pytest
import pytest_asyncio

REDIS_TEST_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6399/1")


@pytest_asyncio.fixture
async def real_redis():
    """A real Redis connection for integration tests (not a mock).

    Requires a Redis instance reachable at TEST_REDIS_URL. CI/dev should run
    one locally (`redis-server --port 6399`) — this is intentionally NOT
    faked, since the pacing controller's Lua script is exactly the part a
    mock would fail to exercise honestly.
    """
    redis = pytest.importorskip("redis.asyncio")
    client = redis.from_url(REDIS_TEST_URL)
    try:
        await client.ping()
    except Exception:
        pytest.skip(f"no real redis reachable at {REDIS_TEST_URL}")
    await client.flushdb()
    yield client
    await client.flushdb()
    await client.aclose()
