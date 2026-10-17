# Organic Growth Studio — Development Handbook

## Active product

Organic Growth Studio is the only application in this repository. The older Instagro web app, API, engagement workers, and related infrastructure were removed on 2026-10-17 and are preserved on the `archive/instagro-platform` branch. Do not reintroduce those systems unless the owner explicitly changes scope.

The Studio finds legitimate organic discovery opportunities, analyzes public target pages, prepares content drafts for human review, creates tagged links, and records first party referral events. It must not create artificial traffic or automate likes, follows, comments, messages, reviews, or platform interactions.

## Scope boundaries

Keep these integrations excluded: Shopify product intelligence, Google Search Console, GA4 and Shopify funnel reporting, Merchant Center feed or free-listing diagnostics, and Pinterest/TikTok publishing. Publishing stays manual. Follow each platform's current terms, rate limits, and authorization requirements before adding a connector.

## Application layout

- `apps/organic-growth-studio/src/app` — Next.js UI and API routes.
- `apps/organic-growth-studio/src/lib` — analysis, adaptive ranking, scheduling, and local persistence.
- `apps/organic-growth-studio/scripts/personal.mjs` — bounded personal scheduler runner.
- `apps/organic-growth-studio/.env.example` — names and safe local defaults; never put credentials in Git.
- `.github/workflows/ci.yml` — the primary app's GitHub Actions checks.
- Retired Instagro code lives on the `archive/instagro-platform` branch, not in this tree.

## Local development

Requires Node.js 22 and pnpm 9. Node 20 reached end of life on 2026-04-30 and is no longer tested.

~~~bash
pnpm install
cp apps/organic-growth-studio/.env.example apps/organic-growth-studio/.env.local
# Set separate random APP_ACCESS_TOKEN, SESSION_SECRET, and AUTOPILOT_TOKEN values in .env.local.
pnpm dev
~~~

`pnpm dev` serves the UI on port 3010. `pnpm personal` runs the bounded scheduler and signs in to the private API. For a single-process production run, build first, then use `APP_MODE=production HOSTNAME=0.0.0.0 DATA_DIR=/path/to/persistent-data pnpm personal` behind HTTPS. Set `DATA_DIR` to a persistent volume. The JSON store and scheduler are not safe across replicas or concurrent app instances.

## Checks

Run `pnpm lint`, `pnpm typecheck`, `pnpm test:ci`, and `pnpm build` before submitting. GitHub Actions runs these checks on pushes and pull requests across branches.

## Data and deployment

The JSON store and scheduler support one personal process; do not run multiple replicas. Private dashboard and API routes require owner authentication. Public event tracking accepts bounded aggregate events from the configured project domain, and short links remain public. Do not commit local `data/`, `.env.local`, tokens, or build output. GitHub Actions builds the app but does not host its continuous scheduler. Put production behind HTTPS, and keep a persistent volume mounted at `DATA_DIR`.

## Contribution workflow

Use a short-lived feature branch and a conventional commit. Open a pull request against the repository's currently configured default branch; do not assume it is named `main`, and do not push directly to or force-push the default branch. Keep CI green and request review before merge. The repository owner may rename or remove legacy branches; use GitHub's default-branch setting as the source of truth.
