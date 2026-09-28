# Instagro

> Enterprise-grade Instagram growth platform.
> Full transparency. Safety-first pacing. Real engaged audiences.

## Overview

Instagro is a SaaS platform for growing Instagram audiences through safe,
transparent automation. It differentiates itself on three promises:

1. **Full transparency** — every action taken on a user's account is logged
   and visible in the dashboard.
2. **Safety-first pacing** — a dedicated pacing controller enforces realistic
   human-behavior patterns, adaptive throttling, and mandatory warm-up periods.
3. **Quality scoring** — every gained follower is scored for realness and
   engagement.

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Web (Next) │──────│  API (FastAPI)│──────│ Workers      │
│  Dashboard   │      │  Auth, CRUD   │      │ Pacing, Exec │
│  Marketing   │      │  Billing      │      │ Discovery    │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │  PostgreSQL · Redis   │
                 │  Kafka/NATS (bus)     │
                 └───────────────────────┘
```

## Quick Start

```bash
pnpm install
cd apps/api && cp .env.example .env && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd ../workers && cp .env.example .env && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd infra/docker && docker-compose up -d postgres redis
cd ../../apps/api && alembic upgrade head
uvicorn app.main:app --reload --port 8000
# In another terminal:
cd apps/web && pnpm dev
```

`DATABASE_URL`/`DATABASE_URL_SYNC` are required (no silent sqlite fallback)
so a missing `.env` fails fast instead of quietly running against a
throwaway local file — see each app's `.env.example`.

Read `claude.md` for the full development handbook.
