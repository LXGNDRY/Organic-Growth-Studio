# Deploying Organic Growth Studio

Single-owner, single-process. The store is a JSON file with no concurrent
writers, so **run exactly one instance against one volume** and never scale it.

## What the container runs

`scripts/personal.mjs` is the entrypoint. It spawns the Next server *and* runs
the scheduler loop, so one process covers both and the single-writer limit
holds. Do not also run `pnpm start` beside it.

## Required configuration

| Variable | Value | Notes |
|---|---|---|
| `APP_ACCESS_TOKEN` | 32+ random chars | Your sign-in token |
| `SESSION_SECRET` | 32+ random chars | Session signing — must differ from the others |
| `AUTOPILOT_TOKEN` | 32+ random chars | Bearer token for `/api/agent/tick` |
| `DATA_DIR` | `/data` | **Must be a persistent volume.** Loses all history otherwise |
| `APP_MODE` | `production` | Else it starts the dev server |
| `HOSTNAME` | `0.0.0.0` | See the gotcha below |
| `PORT` | host-assigned | Honoured by the start script |
| `TRUST_PROXY_HEADER` | `true` behind a proxy | `false` if the container is exposed directly |

Generate each secret separately:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## Three things that will bite you

**1. `HOSTNAME` must be pinned to `0.0.0.0`.** The runner passes `HOSTNAME`
straight to `next -H`. Docker sets `HOSTNAME` to the container id, which is not
a bindable address, and the script's own default of `127.0.0.1` only accepts
connections from inside the container. The image pins it; keep it pinned.

**2. Never ship a `.env` file in the image.** `.dockerignore` excludes them.
A stale `AUTOPILOT_BASE_URL` in a dev `.env.local` points the scheduler at a
port nothing is on — the app stays healthy, pages serve, health checks pass,
and **no cycles ever run**. The runner now says so loudly after five failed
attempts; heed that line, it means the engine is not working.

**3. Leave `AUTOPILOT_BASE_URL` unset.** Unset, the runner derives it from
`PORT` and talks to the app over loopback. Set it only if the scheduler runs
on a different machine.

## Deploy

The container speaks **plain HTTP**. It does not terminate TLS, and publishing
it on port 443 does not make it HTTPS — Docker port mapping only forwards
bytes. That matters more than it sounds: in production the session cookie is
set `Secure`, so a browser refuses to store it over plaintext and **sign-in
fails silently, forever**. Put real TLS in front of it.

### On a platform that terminates TLS (Fly, Render, Railway)

Publish the HTTP port and let the platform's edge do TLS. Set the secrets and
`DATA_DIR=/data`, attach a volume at `/data`, and keep the instance count at
**1**. Nothing else is needed — leave `TRUST_PROXY_HEADER=true`, since the
edge sets `x-forwarded-for`.

### On your own host, behind a proxy

Bind the container to **loopback only**, so it is a private upstream and never
reachable unencrypted from outside:

```sh
docker build -t organic-growth-studio .
docker run -d --name studio \
  -p 127.0.0.1:3010:3010 \
  -v studio-data:/data \
  -e APP_ACCESS_TOKEN=... -e SESSION_SECRET=... -e AUTOPILOT_TOKEN=... \
  --restart unless-stopped \
  organic-growth-studio
```

Then terminate TLS in front of it. Caddy gets a certificate on its own and
sets the forwarded headers correctly:

```
studio.example.com {
    reverse_proxy 127.0.0.1:3010
}
```

Any proxy works, provided it terminates TLS and forwards to `127.0.0.1:3010`.
Keep `TRUST_PROXY_HEADER=true` in this topology: the proxy sets
`x-forwarded-for`, which is what per-IP sign-in throttling counts on. Set it to
`false` only if the container is somehow exposed directly — an unproxied client
can forge that header, and every caller then shares one throttle bucket.

## Verify the deployment

```sh
curl -s https://<host>/api/health            # {"status":"ok"}
```

Then check the logs for a line like:

```
Autopilot cycle: 200 {"startedAt":...,"status":"complete"}
```

**Health alone is not enough.** A healthy app with a dead scheduler is the
failure mode to watch for: confirm you see autopilot cycles, and that
`lastRunAt` advances. Check it at every monthly review.

**If sign-in bounces you straight back to the login page**, you are serving
over plain HTTP. The cookie is `Secure` in production, so the browser accepts
the response and silently discards the session. Fix the TLS termination above
rather than the credentials.

## After the first boot

1. Sign in with `APP_ACCESS_TOKEN`.
2. Create the project pointing at your destination URL.
3. Set `ownershipAttested` and populate `allowedClaims` — without claims the
   engine refuses to assert product facts and drafts come out generic.
4. Leave cadence at the 6-hour default.
