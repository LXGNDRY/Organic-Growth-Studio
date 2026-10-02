# Organic Growth Studio

Personal software for finding legitimate organic discovery opportunities, preparing channel specific drafts, and measuring tagged referrals.

The Studio is the repository's primary application. It analyzes public pages and prepares reviewable work; it does not create fake visits or automate likes, follows, comments, messages, or reviews.

## Start locally

Use Node.js 20 or newer and pnpm 9:

~~~bash
pnpm install
cp apps/organic-growth-studio/.env.example apps/organic-growth-studio/.env.local
~~~

Set separate random values for `APP_ACCESS_TOKEN`, `SESSION_SECRET`, and `AUTOPILOT_TOKEN` in `.env.local`, then run:

~~~bash
pnpm dev
~~~

`pnpm dev` starts the web application on port 3010. To run the bounded personal scheduler alongside it:

~~~bash
pnpm personal
~~~

Generate each secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Keep secrets out of Git and rotate them if exposed. The app stores data under `DATA_DIR` (default `./data`); production use needs a persistent disk mounted there.

## Useful commands

~~~bash
pnpm lint
pnpm typecheck
pnpm test:ci
pnpm build
pnpm start
~~~

## Scope

- Analyze public pages for technical, content, accessibility, canonical, JSON-LD, robots, sitemap, and feed signals.
- Manage target projects, scans, review-only content drafts, tagged links, experiments, and first-party aggregate events.
- Run bounded, concurrent scans and use recorded experiment outcomes to improve opportunity ranking.
- Keep publishing manual. Integrations excluded from this build include Shopify product intelligence, Search Console, GA4 and Shopify funnel reporting, Merchant Center diagnostics, and Pinterest/TikTok publishing.

The older Instagro services and workers in this repository are legacy code, outside the active product. The Studio does not connect to or run them.

## Hosting

Private UI and API routes require owner sign-in; the personal runner signs in for its bounded scheduler calls. Public routes are limited to health, short-link redirects, and bounded event tracking from the registered target domain. For a single-machine production run, build with `pnpm build`, then set `APP_MODE=production`, `HOSTNAME=0.0.0.0`, and `DATA_DIR` to a persistent volume before `pnpm personal`, behind HTTPS. Run one process only: the JSON store and scheduler do not coordinate across replicas. GitHub Actions validates and builds the app; it does not host a persistent web service or scheduler.
