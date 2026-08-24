# Instagro Engagement Engine

The core, non-SaaS engagement engine: discovery → scoring → pacing →
execution → feedback, wired together in `src/engine.py`.

## Running it locally

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install -e ".[dev]"

# Local Redis + Postgres (or use infra/docker/docker-compose.yml)
redis-server --port 6379 &
# Postgres: create a database and point DATABASE_URL/DATABASE_URL_SYNC at it

export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/instagro
export DATABASE_URL_SYNC=postgresql://postgres:postgres@localhost:5432/instagro
export REDIS_URL=redis://localhost:6379/0

# Dry-run: simulated discovery + simulated Instagram client, real pacing +
# real Postgres persistence. Safe to run repeatedly.
python -m src.main demo_account_1 --cycles 5 --sleep 1
```

Going live requires passing a real `InstagramClient` implementation into
`ActionExecutor(..., dry_run=False)` — there is no flag that flips this on
by accident.

## Testing

Unit tests run with mocked Redis and need nothing else:

```bash
pytest -q
```

Integration tests exercise real Redis and real Postgres (no mocks) and are
skipped automatically if neither is reachable:

```bash
redis-server --port 6399 --daemonize yes
createdb instagro_test  # or: psql -c "create database instagro_test"

export TEST_REDIS_URL=redis://localhost:6399/1
export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/instagro_test
pytest -q
```

## What's proven end to end

- The pacing controller never lets an action through once its Redis-backed
  token bucket is empty, and never lets one through while throttled
  (`tests/test_pacing_integration.py`).
- Every action the engine attempts goes through the pacing check first —
  `EngagementEngine._execute_one` is the only call site for
  `ActionExecutor` in worker code.
- A block/rate-limit signal from Instagram is classified and immediately
  fed back into the pacing controller (`src/execution/IGBlockDetector`,
  `tests/test_engine.py`).
- Every attempted action — success or failure — is persisted to Postgres,
  and failures additionally write an audit-log entry
  (`tests/test_feedback_integration.py`).
- `python -m src.main <account> --cycles N` runs the full pipeline
  end-to-end in dry-run mode against real Redis + real Postgres.

## What's deliberately not here yet

Multi-tenant RBAC, billing, the web dashboard, real Instagram sourcing/
scraping, proxy rotation beyond a stub interface, and compliance docs —
these come after the engine above is validated against a real or sandbox
account, per the phased build plan.
