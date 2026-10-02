# Organic Growth Studio

The primary application in this repository: a personal tool for legitimate organic discovery, channel specific draft preparation, tagged referral links, and measurement.

## Capabilities

- Analyze public pages for technical, content, accessibility, canonical, JSON-LD, robots, sitemap, and feed signals.
- Manage target projects, scans, review only content drafts, tagged links, experiments, and first party aggregate events in a local JSON store.
- Run recurring, bounded parallel scans for multiple target sites.
- Use recorded experiment outcomes to improve opportunity ranking.

## Run

From the repository root:

~~~bash
pnpm install
cp apps/organic-growth-studio/.env.example apps/organic-growth-studio/.env.local
# Set AUTOPILOT_TOKEN to a private random secret in .env.local.
pnpm dev
~~~

The web app uses port 3010. In another terminal, `pnpm personal` runs the bounded local scheduler. Root commands are available for lint, typecheck, tests, and production build.

## Operating boundaries

Publishing stays manual. The app does not create artificial visits, automate likes, follows, comments, messages, or reviews, modify target sites, or create ad campaigns. Excluded integrations remain excluded: Shopify product intelligence, Search Console, GA4 and Shopify funnel reporting, Merchant Center diagnostics, and Pinterest/TikTok publishing.

The JSON store and scheduler are for one personal process. Do not expose the app publicly as-is: authentication, durable shared storage, distributed scheduling, quotas, monitoring, and security controls are needed first. GitHub Actions validates and builds the app; it does not host a persistent web service or scheduler.
