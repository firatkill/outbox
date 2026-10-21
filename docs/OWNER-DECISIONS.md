# Owner decisions

Decided by the owner, Fırat Kıl, on 2026-10-21. These hold for all five portfolio projects (Sourced, Bidlock, Rehearse, Outbox, efatura). They are settled: do not ask about them again, and do not change them without the owner's approval (AGENTS.md, checkpoint 2). Where the PRD or TRD says something different, this file wins; tell the owner about the conflict and record it in the PRD decisions log.

## Shared standards

| Area | Decision |
| --- | --- |
| Database | Supabase, free plan, one Supabase project per app. If the free project limit is reached, the owner opens another Supabase account; never upgrade to a paid plan. Local development and CI use the Docker PostgreSQL image the TRD names. |
| Hosting | Vercel, Hobby plan, for every deployed site, including static sites and docs. Production deploys from `main` through Vercel's Git integration; pull requests get preview deployments. |
| Region | Frankfurt: Vercel `fra1`, Supabase AWS `eu-central-1`. |
| Domains | `<project>.firatkil.com`, a CNAME to Vercel. The agent writes the exact DNS record; the owner adds it. |
| LLM provider | OpenAI through the API, as the TRD specifies. Chat model: the cheapest current small model that meets the TRD's needs, pinned to an exact id at build time and recorded. Embeddings: `text-embedding-3-small`. |
| LLM budget | Each LLM app gets its own OpenAI project with a $5 monthly budget and an alert at 50%, plus a separate eval project with a $2 monthly budget. Prepaid credit with auto-recharge off. |
| npm | Scope `@firatkill` (the owner's npm user name, same as GitHub). Packages: `@firatkill/outbox`, `@firatkill/efatura`. |
| Licence | MIT, copyright Fırat Kıl. |
| Analytics and monitoring | None in v1: no Vercel Web Analytics, no Speed Insights, no Sentry, no telemetry. Vercel's built-in logs only. |
| Email | None. |
| Paid services | None. Anything that could create a bill needs the owner's approval first. |
| Toolchain | As each TRD specifies (pnpm, Node, TypeScript strict, Vitest, Playwright). Not a question for the owner. |
| Accounts and secrets | The owner creates accounts and API keys. The agent lists exactly which variables go where (Vercel environment variables, GitHub secrets, `.env.local`) and never asks the owner to paste a secret into the chat. |

## This project

- npm package `@firatkill/outbox`.
- Support matrix: Node 20, 22 and 24, PostgreSQL 14, 16 and 17 (D-01, D-03).
- Drivers: postgres.js and pg adapters (D-02).
- Docs: VitePress on Vercel at `outbox.firatkil.com`. This replaces GitHub Pages from the original spec.
- No database in production; PostgreSQL runs only in CI and locally.

## Still needs the owner

Everything not settled above, in particular the items in AGENTS.md "Owner approval checkpoints" 2 to 5: specs that do not hold, creating external resources (including the GitHub repository), new runtime dependencies, and destructive operations. Ask these as one grouped list.
