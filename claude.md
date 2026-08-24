# Instagro — Development Handbook

> Enterprise-grade Instagram growth platform. Monorepo with FastAPI backend,
> Next.js frontend, engagement-worker farm, and shared packages.

---

## 1. Repo Purpose

Instagro is a production-grade SaaS that helps creators, brands, and agencies
grow their Instagram audience through transparent, safety-first engagement
automation combined with AI-driven audience intelligence.

The platform differentiates itself on three promises:

1. **Full transparency** — every action taken on a user's account is logged,
   visible, and auditable in the dashboard.
2. **Safety-first pacing** — a dedicated pacing controller enforces realistic
   human-behavior patterns, adaptive throttling, and warm-up periods to keep
   accounts within Instagram's rate limits.
3. **Enterprise-grade compliance** — SOC 2-ready security, encrypted
   credentials, audit trails, and multi-tenant RBAC.

This repo is the single source of truth for the entire product.

---

## 2. Monorepo Structure

```
Instagro/
├── claude.md                 # this file — always read first
├── package.json              # root workspace config (pnpm)
├── pnpm-workspace.yaml
├── turbo.json                # Turborepo build graph
├── .gitignore
├── .editorconfig
├── .github/
│   └── workflows/
│       ├── ci.yml            # lint, typecheck, test, build
│       └── release.yml
├── packages/
│   ├── shared/               # shared TypeScript types, zod schemas, config
│   │   ├── src/
│   │   │   ├── types.ts      # domain types shared across packages
│   │   │   ├── schemas.ts    # zod validators for API/DB boundaries
│   │   │   ├── plans.ts      # plan definitions, entitlements, limits
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── config/               # shared configs (eslint, tsconfig base)
│       ├── eslint-preset.js
│       ├── tsconfig.base.json
│       └── package.json
├── apps/
│   ├── web/                  # Next.js App Router — marketing + dashboard
│   │   ├── src/
│   │   │   ├── app/          # App Router routes
│   │   │   ├── components/   # shared UI components
│   │   │   ├── lib/          # api client, auth helpers, env
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   └── tsconfig.json
│   ├── api/                  # FastAPI — auth, billing, analytics, CRUD
│   │   ├── app/
│   │   │   ├── main.py       # FastAPI entrypoint
│   │   │   ├── config.py     # settings / env
│   │   │   ├── db/           # SQLAlchemy models, migrations
│   │   │   ├── api/          # route modules
│   │   │   ├── services/     # business logic
│   │   │   └── schemas/      # pydantic schemas
│   │   ├── tests/
│   │   ├── alembic/
│   │   ├── requirements.txt
│   │   ├── pyproject.toml
│   │   └── Dockerfile
│   └── workers/              # Engagement engine — workers, pacing, scoring
│       ├── src/
│       │   ├── main.py           # worker entrypoint
│       │   ├── config.py
│       │   ├── pacing/           # pacing controller, token bucket, warm-up
│       │   ├── discovery/        # target discovery service
│       │   ├── scoring/          # AI/ML audience scorer
│       │   ├── execution/        # action execution + proxy management
│       │   ├── feedback/         # result → database/warehouse
│       │   └── infra/            # Kafka/NATS client, Redis, proxies
│       ├── tests/
│       ├── requirements.txt
│       ├── pyproject.toml
│       └── Dockerfile
├── infra/
│   ├── terraform/             # infrastructure as code
│   └── docker/                # docker-compose for local dev
└── docs/
    ├── architecture.md
    ├── safety-model.md
    └── compliance/
```

---

## 3. Tech Stack

### Backend (Python 3.12)
- **FastAPI** — API gateway, auth, analytics, billing webhooks
- **SQLAlchemy 2.0** + **Alembic** — ORM + migrations
- **PostgreSQL** — primary datastore (managed, HA)
- **Redis** — rate limiting, pacing tokens, session storage
- **Kafka / NATS JetStream** — event bus + job queue
- **ClickHouse** — analytics warehouse (engagement events, quality metrics)
- **Pydantic v2** — schema validation

### Frontend (TypeScript)
- **Next.js 14+ App Router** — SSR marketing + interactive dashboard
- **React 18** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** — design system
- **TanStack Query** — data fetching / cache
- **Zustand** — client state
- **zod** — runtime validation (shared with API)

### Shared TypeScript
- **pnpm workspaces** + **Turborepo** — monorepo build orchestration
- **Vitest** — test runner for TS packages

### Infrastructure
- **Terraform / Pulumi** — IaC
- **Docker** + container orchestration
- **OpenTelemetry** — unified observability (metrics, logs, traces)
- **Grafana** + **Loki** + **Prometheus** — dashboards
- **Sentry** — error tracking

---

## 4. Development Workflow

### Setup

```bash
# Clone
git clone git@github.com:LXGNDRY/Instagro-.git
cd Instagro-

# Install Node dependencies
pnpm install

# Install Python dependencies (use venv per app)
cd apps/api && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd ../workers && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Start local infrastructure (Postgres, Redis, Kafka)
cd infra/docker && docker-compose up -d

# Run DB migrations
cd apps/api && alembic upgrade head
```

### Commands

```bash
# Lint everything
pnpm lint

# Typecheck everything
pnpm typecheck

# Test everything
pnpm test

# Build everything
pnpm build

# Run a single package
pnpm --filter @instagro/web dev
pnpm --filter @instagro/api dev
pnpm --filter @instagro/workers dev
```

### Branching & Commits

- `main` — always deployable, protected
- Feature branches: `feat/xxx`, `fix/xxx`, `chore/xxx`
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
- All PRs require CI green + 1 approval
- Never force-push `main`

---

## 5. Architecture Principles

### Safety Is Non-Negotiable

The engagement engine has one rule above all else: **do not get user accounts
banned or action-blocked**. Every change to the pacing controller, action
execution, or targeting must be evaluated through the safety lens first.

- The pacing controller is the single source of truth for action rates.
- No code path can bypass the token-bucket budget check.
- Any Instagram block/error signal triggers immediate throttling.
- New features start in **dry-run / simulation mode** before touching real
  accounts.

### Transparency by Default

Every action taken on a user's account must be logged and visible to that user
in the dashboard. No black boxes. No hidden actions. The audit log is the
source of truth — if it isn't logged, it didn't happen.

### Multi-Tenant from Day One

All data is tenant-scoped. Every DB table has a `tenant_id`. RBAC ensures
users can only access resources in their own tenant. Enterprise tenants get
dedicated or isolated infrastructure options.

### Layered Defense (Security)

- Instagram access tokens are the crown jewels — least-privilege access,
  encrypted at rest, never logged, never returned to the client.
- Secrets in vault, never in code or env files.
- All network traffic TLS 1.3.
- Defense in depth: WAF, rate limiting, input validation, output encoding.

---

## 6. Plan Entitlements

Defined in `packages/shared/src/plans.ts` and mirrored in the Python API's
`services/plan_service.py`. Single source of truth is `plans.ts` — the API
reads a generated JSON copy.

| Feature | Starter | Growth | Scale | Agency | Enterprise |
|---|---|---|---|---|---|
| Daily action budget | 250 | 600 | 1,200 | 4,000 | Custom |
| Instagram accounts | 1 | 3 | 10 | 25+ | Unlimited |
| AI quality scoring | Basic | Advanced | Real-time | Real-time | Custom |
| Support | Email | Priority | Chat | Account mgr | Dedicated SE |
| SOC 2 report | — | — | ✓ | ✓ | ✓ |

---

## 7. Constraints & Hard Rules

### Never Do These

1. **Never log Instagram access tokens or session cookies** — not even
   partially. Logging any part of a token is a P0 incident.
2. **Never bypass the pacing controller** — every engagement action must
   acquire a token from the bucket first.
3. **Never make claims about "100% Instagram-compliant" or "API-approved"** —
   be honest about the mechanism and the risk tradeoffs.
4. **Never skip migrations or edit the DB schema manually** — all schema
   changes go through Alembic.
5. **Never commit secrets, API keys, or proxy credentials** to version
   control. Use the secrets manager and `.env.example`.
6. **Never introduce a new dependency without evaluating it** — check
   maintenance status, license, and security track record.
7. **Never store PII in log messages** — PII must be scrubbed at the
   logging boundary.

### Always Do These

1. **Write tests for the pacing controller and safety logic** — these are
   the most critical paths in the product.
2. **Document every API endpoint** — OpenAPI is auto-generated, but route
   modules need docstrings and examples.
3. **Use typed schemas at every boundary** — Pydantic/zod validates input at
   every ingress point.
4. **Add observability to new features** — metrics, structured logs, and
   trace context for anything that touches Instagram or billing.
5. **Use feature flags for new capabilities** — roll out engagement changes
   incrementally, not in a big bang.
6. **Maintain backward compatibility on public APIs** — version breaking
   changes (`/v1/`, `/v2/`).

---

## 8. Testing Strategy

### Python (API + Workers)
- `pytest` with `pytest-asyncio` for async code
- Unit tests for services, controllers, validators
- Integration tests against a test Postgres container
- The pacing controller has **100% test coverage requirement**
- Mock external services (Instagram API, Stripe, proxies)

### TypeScript (Web + Shared)
- `vitest` for unit tests
- `@testing-library/react` for component tests
- Shared types/schemas have comprehensive test coverage
- E2E tests with Playwright for critical flows (signup, connect account,
  targeting setup, billing)

### CI Pipeline
On every PR:
1. Install dependencies (cached)
2. Lint (ESLint + pylint/ruff)
3. Typecheck (tsc + mypy)
4. Unit tests (all packages)
5. Build (all packages)
6. Integration tests (API only, with test DB)
7. Security scan (dependency audit, secret scan)

---

## 9. Deployment

Environments: `dev` → `staging` → `production`

- **Dev**: auto-deploy on push to feature branches (preview)
- **Staging**: auto-deploy on merge to `main`
- **Production**: manual approval + tagged release

Each service deploys independently:
- `web` → Vercel or Cloud Run
- `api` → Cloud Run or Kubernetes
- `workers` → Kubernetes (scaled by queue depth)

Database migrations run in a separate step before the new code deploys.
Rollbacks are supported via tagged versions.

---

## 10. Getting Oriented

To find your way around quickly:

| Want to... | Start at |
|---|---|
| Understand the data model | `apps/api/app/db/models.py` |
| See all API routes | `apps/api/app/api/` (routed via `main.py`) |
| Understand the engagement engine | `apps/workers/src/pacing/` + `apps/workers/src/execution/` |
| Change plan entitlements | `packages/shared/src/plans.ts` |
| Add a dashboard page | `apps/web/src/app/dashboard/` |
| Add a shared type/schema | `packages/shared/src/types.ts` or `schemas.ts` |
| See the safety model | `docs/safety-model.md` |

---

*Last updated: 2024-08-24 — maintain with the repo. If anything in this file
conflicts with reality, fix the file, don't just work around it.*
