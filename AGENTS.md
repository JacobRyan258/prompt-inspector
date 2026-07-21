# AGENTS.md — Prompt Inspector

OpenAI-compatible intelligent routing proxy ("cheapest GPT-5.6 tier that can answer").
Tagline: *Before you spend money asking GPT-5.6... let Kimi inspect your prompt first.*

## Layout

- `packages/core` — the routing brain (`@prompt-inspector/core`). Pure TS +
  better-sqlite3 + postgres (dotenv). Consumed as TS source (no build step):
  web via `transpilePackages`, proxy via `tsx`.
- `apps/proxy` — Fastify 5, OpenAI-compatible endpoints. **The only writer to the DB.**
  With `PROXY_API_KEY` set, `/v1/*` requires that Bearer token (gate for public
  hosting) and caller Authorization is no longer forwarded upstream.
- `apps/web` — Next.js 15 (App Router). Reads the DB via core from server components.
- Storage — Supabase Postgres when `DATABASE_URL` is set (root `.env`,
  transaction pooler: `prepare:false`, `ssl:"require"`, small pool). When unset,
  zero-config fallback: shared SQLite file at `.data/` (WAL, gitignored,
  auto-created). All db.ts functions are async so both backends share one signature.

## Commands

- `pnpm install` — workspace install (native builds are allow-listed in `pnpm-workspace.yaml`).
- `pnpm dev` / `pnpm build` / `pnpm test` (turbo, all packages).
- `pnpm db:seed` — seed 14 days of demo dashboard data (`-- --force` to reseed).
- Per package: `pnpm --filter @prompt-inspector/{core,proxy,web} <script>`.
- Core classifier check: `pnpm --filter @prompt-inspector/core exec tsx src/accuracy.ts`.

## Conventions

- **The classifier stays deterministic.** No LLM calls in inspection — every score
  point must produce a human-readable reason. Inspection is free, instant, offline.
- **`packages/core/src/pricing.ts` is the single source of truth** for tier names,
  pricing, and latency coefficients. Never hardcode prices elsewhere.
- Tier vocabulary (`luna/terra/sol`, `gpt-5.6-*`) is product language; real upstream
  models come only from env (`INSPECTOR_MODEL_*`). Missing config ⇒ demo mode,
  never an error.
- Demo responses must be clearly labeled and must never require config.
- Web: dark-only UI, zinc palette, no gradients, tabular numerals for money,
  tier colors (Luna sky / Terra violet / Sol amber). Hand-rolled shadcn-style
  components — no Radix deps.
- Client components must not import `@prompt-inspector/core` root (it pulls in
  better-sqlite3); use subpath imports like `@prompt-inspector/core/pricing`.
- Humor is about AI economics only ("Kimi says...", "financially audited") —
  tasteful, never political.

## Gotchas

- pnpm 11: build-script allow-list lives in `pnpm-workspace.yaml` (`allowBuilds`),
  and pnpm auto-appends stubs for new native deps — set them to `true`.
- Repo root path may contain a space — quote paths in scripts.
