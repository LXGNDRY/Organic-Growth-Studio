# Organic Growth Studio

Personal software for finding legitimate organic discovery opportunities, preparing channel specific drafts, and measuring tagged referrals.

The Studio is the repository's primary application. It analyzes public pages and prepares reviewable work; it does not create fake visits or automate likes, follows, comments, messages, or reviews.

## Start locally

Use Node.js 20 or newer and pnpm 9:

~~~bash
pnpm install
cp apps/organic-growth-studio/.env.example apps/organic-growth-studio/.env.local
~~~

Set a private `AUTOPILOT_TOKEN` in `.env.local`, then run:

~~~bash
pnpm dev
~~~

`pnpm dev` starts the web application on port 3010. To run the bounded personal scheduler alongside it:

~~~bash
pnpm personal
~~~

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

GitHub Actions validates and builds the application; GitHub does not host its persistent scheduler. The current JSON store and scheduler are for a single personal process. Before exposing the app publicly, add authentication, durable storage, distributed scheduling, rate limits, monitoring, and deployment controls.
