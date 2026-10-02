# Organic Growth Studio

A private, personal tool for finding legitimate organic discovery opportunities, preparing channel-specific drafts, and measuring tagged referrals. It does not create fake visits or automate likes, follows, comments, messages, or reviews. This app is isolated from Instagro's existing engagement workers.

## Current capabilities

- Analyze public web pages for technical, content, accessibility, canonical, JSON-LD, robots, sitemap, and feed signals.
- Keep projects, scans, drafts, tagged links, experiments, and aggregate first-party events in a local JSON store.
- Run recurring, bounded parallel scans for multiple target sites.
- Create review-only content and experiments; publishing remains manual.
- Use a small adaptive ranker on manually recorded experiment outcomes.

## Run inside the monorepo

~~~bash
pnpm install
cp apps/organic-growth-studio/.env.example apps/organic-growth-studio/.env.local
# Replace AUTOPILOT_TOKEN with a long random secret.
pnpm --filter @instagro/organic-growth-studio personal
~~~

The app uses port 3010 to keep the existing Instagro web app on port 3000. Run pnpm --filter @instagro/organic-growth-studio test:ci, typecheck, lint, or build to validate it.

## Operating boundary

The autopilot only reads saved public URLs and prepares material for review. It does not publish content, modify a target site, automate Instagram actions, create ad campaigns, or verify sales. The excluded integrations remain excluded: Shopify product intelligence, Search Console, GA4/Shopify funnel reporting, Merchant Center diagnostics, and Pinterest/TikTok publishing.

The JSON store and runner are for a single personal process. Do not expose this service publicly as-is: API authentication, durable shared storage, distributed scheduling, quotas, monitoring, and security review are required before a public or multi-user deployment. GitHub Actions in this repository will validate and build the app; they do not host its long-running Next.js service.
