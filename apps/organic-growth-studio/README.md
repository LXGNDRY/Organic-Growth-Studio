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
# Set separate random APP_ACCESS_TOKEN, SESSION_SECRET, and AUTOPILOT_TOKEN values in .env.local.
pnpm dev
~~~

The web app uses port 3010. In another terminal, `pnpm personal` runs the bounded local scheduler. Root commands are available for lint, typecheck, tests, and production build.

Generate each secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Private UI and API routes require owner sign-in; the personal runner signs in to call the private autopilot API. Set `DATA_DIR` to a persistent volume for production (default `./data`). For one-machine production mode, run `pnpm build` then `APP_MODE=production HOSTNAME=0.0.0.0 DATA_DIR=/path/to/persistent-data pnpm personal` behind HTTPS. Use one process; the JSON store and scheduler do not support replicas or concurrent writers. GitHub Actions is CI, not a persistent runtime host.

## Operating boundaries

Publishing stays manual. The app does not create artificial visits, automate likes, follows, comments, messages, or reviews, modify target sites, or create ad campaigns. Excluded integrations remain excluded: Shopify product intelligence, Search Console, GA4 and Shopify funnel reporting, Merchant Center diagnostics, and Pinterest/TikTok publishing.

Publishing remains manual. Public event tracking accepts bounded aggregate events from the registered target domain; short-link redirects remain public. The JSON store and scheduler are for one personal process.
