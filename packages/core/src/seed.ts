import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BENCHMARKS } from "./benchmarks.js";
import { inspect } from "./classify.js";
import { getDb, isSeeded, logRequest } from "./db.js";
import { TIERS, TIER_ORDER, upstreamModelFor } from "./pricing.js";
import type { RequestLogEntry, Tier } from "./types.js";

/**
 * Seeds 14 days of plausible routing history so the dashboard is
 * screenshot-ready on first clone. Deterministic (fixed PRNG seed), idempotent
 * (no-op unless the DB is empty or --force is passed).
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROJECTS = ["website", "support-bot", "data-pipeline", "mobile-app"];
const PROJECT_WEIGHTS = [0.34, 0.3, 0.22, 0.14];

function pick<T>(rand: () => number, items: T[], weights?: number[]): T {
  const w = weights ?? items.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= w[i]!;
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Representative tool counts so tool-calling benchmarks route realistically. */
function toolCountFor(itemId: string): number {
  if (itemId.includes("weather")) return 1;
  if (itemId.includes("multi-step")) return 4;
  if (itemId.includes("orchestration")) return 5;
  return 0;
}

export function seedDemoData(force = false): { inserted: number } {
  const db = getDb();
  if (!force && isSeeded(db)) return { inserted: 0 };
  if (force) {
    db.exec(`DELETE FROM requests; DELETE FROM benchmark_runs; DELETE FROM benchmark_results;`);
  }

  const rand = mulberry32(20260721);
  const now = Date.now();
  const day = 86_400_000;

  const insert = db.transaction((entries: RequestLogEntry[]) => {
    for (const entry of entries) logRequest(db, entry);
  });

  const entries: RequestLogEntry[] = [];

  for (let d = 14; d >= 0; d--) {
    // Volume ramps up — adoption grew over the two weeks.
    const growth = 1 + (14 - d) * 0.12;
    const requestsToday = Math.round((46 + rand() * 30) * growth);

    for (let i = 0; i < requestsToday; i++) {
      const project = pick(rand, PROJECTS, PROJECT_WEIGHTS);
      const item = pick(rand, BENCHMARKS);
      const toolCount = toolCountFor(item.id);
      const inspection = inspect({
        prompt: item.prompt,
        tools: Array.from({ length: toolCount }, () => ({})),
      });

      // 78% auto-routed; the rest are humans forcing a tier (often Sol —
      // that's the waste story the dashboard tells).
      const forced = rand() < 0.22;
      const forcedTier: Tier = forced
        ? pick(rand, TIER_ORDER, [0.18, 0.22, 0.6])
        : inspection.tier;
      const routedTier = forced ? forcedTier : inspection.tier;

      const jitter = 0.7 + rand() * 0.7;
      const inputTokens = Math.max(
        20,
        Math.round(inspection.estimates.inputTokens * jitter),
      );
      const outputTokens = Math.max(
        15,
        Math.round(inspection.estimates.outputTokens * (0.6 + rand() * 0.9)),
      );
      const spec = TIERS[routedTier];
      const costUsd =
        (inputTokens / 1_000_000) * spec.inputPer1M +
        (outputTokens / 1_000_000) * spec.outputPer1M;
      const solSpec = TIERS.sol;
      const solCostUsd =
        (inputTokens / 1_000_000) * solSpec.inputPer1M +
        (outputTokens / 1_000_000) * solSpec.outputPer1M;

      // Business-hours weighted timestamp.
      const hour = 8 + Math.floor(rand() * 11);
      const ts =
        now - d * day - (23 - hour) * 3_600_000 + Math.floor(rand() * 3_600_000);

      entries.push({
        id: randomUUID(),
        ts,
        project,
        api: rand() < 0.72 ? "chat" : "responses",
        requestedModel: forced ? TIERS[routedTier].model : "gpt-5.6-auto",
        routedTier,
        recommendedTier: inspection.tier,
        upstreamModel: upstreamModelFor(routedTier) ?? `demo-${routedTier}`,
        taskType: inspection.taskType,
        reasons: inspection.reasons,
        confidence: inspection.confidence,
        inputTokens,
        outputTokens,
        costUsd,
        solCostUsd,
        savedUsd: Math.max(0, solCostUsd - costUsd),
        latencyMs: Math.round(inspection.estimates.latencyMs * (0.7 + rand() * 0.8)),
        status: rand() < 0.985 ? "ok" : "error",
        streaming: rand() < 0.6,
        forced,
        hadTools: toolCount > 0,
        hadImages: false,
      });
    }
  }

  insert(entries);
  return { inserted: entries.length };
}

// CLI entry: `pnpm --filter @prompt-inspector/core seed [-- --force]`
const isMain =
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const force = process.argv.includes("--force");
  const { inserted } = seedDemoData(force);
  if (inserted === 0) {
    console.log("Database already has requests — nothing seeded (use --force to reseed).");
  } else {
    console.log(`Seeded ${inserted} demo requests across ${PROJECTS.length} projects.`);
  }
}
