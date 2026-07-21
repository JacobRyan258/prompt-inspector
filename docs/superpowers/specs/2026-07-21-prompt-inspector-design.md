# Prompt Inspector — Design

> Before you spend money asking GPT-5.6... let Kimi inspect your prompt first.

Prompt Inspector is an OpenAI-compatible intelligent routing proxy. Point your SDK at it
instead of `api.openai.com`; it inspects each prompt and routes it to the cheapest
GPT-5.6 tier (Luna / Terra / Sol) that can answer it well. Paste a prompt in the
playground and get the same analysis instantly, no API key required.

## Goals

- Save developers money without them thinking (routing is automatic, one-line change).
- Every routing decision explains itself (Decision Inspector).
- Every screen produces a screenshot worth posting (dashboard, share cards, benchmarks).
- Open source; setup in under 5 minutes; no-key demo mode everywhere.

## Non-goals (architecture-ready, not built)

- Multi-provider routing (Claude, Gemini, Grok, Kimi, OpenRouter)
- Team workspaces, hosted cloud version, auth, billing

## Architecture

pnpm + Turborepo monorepo, TypeScript everywhere.

```
apps/
  web/    Next.js 15 (App Router) — landing page + public playground, spending
          dashboard, challenge mode, benchmark runner, OG share cards.
          Reads SQLite directly via @prompt-inspector/core (server components).
  proxy/  Fastify 5 — OpenAI-compatible endpoints, the only writer to SQLite.
packages/
  core/   @prompt-inspector/core — the product brain. Pure TypeScript, one native
          dep (better-sqlite3). Consumed as TS source (web: transpilePackages,
          proxy: tsx). No build step in dev.
.data/    SQLite file (gitignored), created on first use.
```

Why deterministic heuristics instead of an LLM classifier: inspection must be free,
instant, offline-capable in demo mode, and — most importantly — *explainable*. A rules
engine can honestly say "Luna because: under 400 tokens, classification task, no
coding". An LLM cannot.

## Core engine (packages/core)

- `pricing.ts` — tier table (single source of truth): Luna/Terra/Sol with per-1M
  input/output prices, latency coefficients, capability notes, and the env-configurable
  upstream model mapping. Fictional-but-plausible GPT-5.6 pricing, clearly marked
  configurable.
- `tokens.ts` — token estimation (chars/4 + per-message overhead) and payload
  normalization: accepts a raw prompt string OR an OpenAI-style
  `{ messages, tools, ... }` payload; extracts text, image count, tool count.
- `classify.ts` — `inspect(input): Inspection`. Scoring signals: estimated tokens,
  task type (classification / extraction / summarization / translation / writing /
  coding / architecture / math / reasoning / agentic), code presence, multi-part
  question count, output-length demand, tool calling, images, long context.
  Score bands map to tiers; cheap-task bonuses can pull a borderline prompt down a
  tier; capability floors (images ⇒ ≥Terra, heavy tool chains ⇒ ≥Terra). Returns:
  tier, reasoning level (minimal/low/medium/high), confidence (margin-based),
  human-readable reasons[], estimated tokens/latency/cost, full Luna/Terra/Sol cost
  comparison, and the headline waste line ("You would spend 63% more using Sol").
- `optimize.ts` — `optimizePrompt(input, inspection): Optimization[]`. Rule-based
  suggestions with projected tier and savings: trim few-shot examples, drop
  deep-thinking instructions on simple tasks, split multi-task prompts, add output
  length caps, remove duplicated context, strip politeness filler.
- `benchmarks.ts` — 30-prompt dataset: coding, architecture, extraction,
  summarization, translation, reasoning, math, long context, tool calling, writing
  (3 each), with expected tiers for router-accuracy reporting.
- `db.ts` — better-sqlite3 (WAL). Tables: `requests` (every proxied request with
  routing decision, reasons, costs, baseline Sol cost, savings, latency, project tag)
  and `benchmark_runs`/`benchmark_results`. Aggregation queries for the dashboard
  (totals, savings %, model distribution, daily trend, project breakdown, waste
  detection: "you send N% of traffic to Sol, ~$X/mo unnecessary").
- `seed.ts` — generates 14 days of plausible routing history for instant screenshots.

## Proxy (apps/proxy, port 4000)

- `POST /v1/chat/completions` — full passthrough: streaming, tool calling, images.
- `POST /v1/responses` — Responses API passthrough incl. streaming.
- `GET /v1/models` — lists the tier models.
- Model field controls routing: `gpt-5.6-auto` (default) → classify & route;
  `gpt-5.6-luna|terra|sol` → forced tier (logged as such, powers Challenge mode).
  Headers: `x-prompt-inspector-tier` force-routes, `x-prompt-inspector-project` tags
  spend by project.
- Upstream: `OPENAI_BASE_URL` + `OPENAI_API_KEY`; tier→model mapping via
  `INSPECTOR_MODEL_LUNA/TERRA/SOL`. No key ⇒ demo mode: synthesized, clearly-labeled
  responses (incl. streaming) so the whole product works keyless.
- Usage accounting: reads `usage` from responses; requests
  `stream_options.include_usage` on streams; falls back to core estimates.
  Every request logged with reasons + savings vs Sol baseline.

## Web (apps/web, port 3000)

Dark-only, minimal, no gradients, tabular numerals for money. shadcn-style
components, Tailwind, Recharts, Geist font.

- `/` — landing: hero = the playground (paste prompt → inspect, no login). Result
  card: recommended tier + reasoning level + confidence, reasons, cost comparison
  bars across Luna/Terra/Sol with the Sol-premium callout, latency/token estimates,
  optimizer suggestions, Share button. Below: "point your SDK" code block, feature
  grid, footer with the Kimi joke (economics humor, tasteful).
- `/dashboard` — spend, saved, savings %, requests; daily trend area chart; model
  distribution donut; waste-detection callout; project breakdown; routing history
  table with per-request Decision Inspector rows.
- `/challenge` — run one prompt forced through Luna/Terra/Sol, side-by-side
  responses with cost/latency and whether the extra money bought quality.
- `/benchmarks` — dataset browser by category, run button, per-tier
  cost/latency/output comparison, router accuracy vs expected tiers.
- `/api/inspect`, `/api/challenge`, `/api/benchmarks/run` — server routes on core
  (runs go through the proxy when configured, demo mode otherwise).
- `/api/og` — `next/og` share cards: "Kimi says this only needs Luna.", "You almost
  wasted 71%.", "Prompt successfully downgraded.", "This prompt has been financially
  audited."

## Data flow

SDK → proxy (classify → route → upstream → log) → SQLite ← web dashboard (read).
Playground → /api/inspect → core.inspect (no DB write, no key).

## Error handling

- Upstream errors pass through with original status/body; logged as failures.
- Demo mode never errors on missing key; every demo response is labeled.
- Dashboard renders seeded/demo data when DB is fresh; never an empty broken screen.

## Testing / verification

- Core: `tsx` test script covering classifier bands, optimizer rules, cost math,
  seed determinism.
- Proxy: curl chat completion + streaming + forced tier, demo mode and (if key) live.
- Web: `pnpm build`, curl `/`, `/dashboard`, `/api/og` PNG.
