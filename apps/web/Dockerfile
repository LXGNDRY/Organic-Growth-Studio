# Built from the repo root (see infra/docker/docker-compose.yml's
# `context: ../..`) since this is a pnpm workspace: apps/web depends on
# packages/shared, so the build needs the whole monorepo, not just this
# directory.
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Mirrors exactly what CI runs for this package (.github/workflows/ci.yml,
# "Web App" job) — no separate shared-package build step, since
# @instagro/shared's exports map points straight at its .ts source and
# Next.js transpiles it as part of this build.
RUN pnpm --filter @instagro/web run build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
