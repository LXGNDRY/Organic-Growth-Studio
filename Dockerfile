# Single-owner deployment for Organic Growth Studio.
# The store is a JSON file with no concurrent writers, so this image is meant
# to run as exactly one instance with one persistent volume. Do not scale it.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/organic-growth-studio/package.json apps/organic-growth-studio/
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/organic-growth-studio/node_modules ./apps/organic-growth-studio/node_modules
COPY . .
# Build runs verify-build.mjs, which fails the image if middleware is not
# registered or a script imports something the app does not declare.
RUN pnpm --filter organic-growth-studio build

FROM node:22-alpine AS runtime
WORKDIR /app/apps/organic-growth-studio
RUN corepack enable
ENV NODE_ENV=production
# A reverse proxy in front of the container sets x-forwarded-for, so per-IP
# sign-in throttling is safe to trust here. Override to "false" if you expose
# the container directly.
ENV TRUST_PROXY_HEADER=true
ENV DATA_DIR=/data
# personal.mjs is the production entrypoint: it spawns the server AND runs the
# scheduler loop, so one process covers both and the single-writer limit holds.
ENV APP_MODE=production
# It passes HOSTNAME straight to "next -H". Docker sets HOSTNAME to the
# container id, which is not a bindable address, and its own default of
# 127.0.0.1 would only accept connections from inside the container. Pin it.
ENV HOSTNAME=0.0.0.0
ENV PORT=3010

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/organic-growth-studio/node_modules ./node_modules
COPY --from=build /app/apps/organic-growth-studio/.next ./.next
COPY --from=build /app/apps/organic-growth-studio/public ./public
COPY --from=build /app/apps/organic-growth-studio/package.json ./package.json
COPY --from=build /app/apps/organic-growth-studio/next.config.ts ./next.config.ts
COPY --from=build /app/apps/organic-growth-studio/scripts ./scripts

# The app creates DATA_DIR at 700 and the store at 600; it must be owned by the
# user that runs it, or the first write fails on a mounted volume.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3010}/api/health" || exit 1

CMD ["node", "scripts/personal.mjs"]
