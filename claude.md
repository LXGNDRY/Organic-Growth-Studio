# Organic Growth Studio — Development Handbook

## Active product

Organic Growth Studio is the repository's primary application and the only active product in this workspace. The older Instagro web app, API, engagement workers, and related infrastructure are legacy code. Do not start, extend, or reconnect those systems as part of Studio work unless the owner explicitly changes scope.

The Studio finds legitimate organic discovery opportunities, analyzes public target pages, prepares content drafts for human review, creates tagged links, and records first party referral events. It must not create artificial traffic or automate likes, follows, comments, messages, reviews, or platform interactions.

## Scope boundaries

Keep these integrations excluded: Shopify product intelligence, Google Search Console, GA4 and Shopify funnel reporting, Merchant Center feed or free-listing diagnostics, and Pinterest/TikTok publishing. Publishing stays manual. Follow each platform's current terms, rate limits, and authorization requirements before adding a connector.

## Application layout

- `apps/organic-growth-studio/src/app` — Next.js UI and API routes.
- `apps/organic-growth-studio/src/lib` — analysis, adaptive ranking, scheduling, and local persistence.
- `apps/organic-growth-studio/scripts/personal.mjs` — bounded personal scheduler runner.
- `apps/organic-growth-studio/.env.example` — names and safe local defaults; never put credentials in Git.
- `.github/workflows/ci.yml` — the primary app's GitHub Actions checks.
- Legacy Instagro code remains in the repository but is not part of the active app.

## Local development

Requires Node.js 20+ and pnpm 9.

~~~bash
pnpm install
cp apps/organic-growth-studio/.env.example apps/organic-growth-studio/.env.local
# Set a private AUTOPILOT_TOKEN in .env.local.
pnpm dev
~~~

`pnpm dev` serves the UI on port 3010. `pnpm personal` runs the bounded scheduler. `pnpm start` serves a production build.

## Checks

Run `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, and `pnpm build` before submitting. GitHub Actions runs these same checks on pull requests to `main`.

## Data and deployment

The local JSON store supports one personal process; it is not safe for concurrent instances or public multi-user use. Do not commit local `data/`, `.env.local`, tokens, or build output. GitHub Actions builds the app but does not host its continuous scheduler. Public deployment requires authentication, durable storage, distributed job coordination, rate limits, monitoring, and operational controls.

## Contribution workflow

Use a feature branch and a conventional commit. Open a pull request to `main`; do not force-push or push directly to `main`. Keep CI green and request review before merge.
