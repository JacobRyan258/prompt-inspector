/**
 * Smoke tests for the routing brain. Run: pnpm --filter @prompt-inspector/core test
 * Not a framework — plain assertions, exits non-zero on failure.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspect } from "./classify.js";
import { optimizePrompt } from "./optimize.js";
import { estimateCostUsd, parseModelTier } from "./pricing.js";
import { estimateTokens, normalizeInput } from "./tokens.js";
import { getDb, getDashboardStats, logRequest } from "./db.js";
import { seedDemoData } from "./seed.js";

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(err);
  }
}

check("cheap classification prompt routes to Luna", () => {
  const r = inspect({ prompt: "Classify this review as positive or negative: 'Loved it, works perfectly.'" });
  assert.equal(r.tier, "luna");
  assert.ok(r.reasons.includes("classification task"));
  assert.ok(r.reasons.includes("no coding"));
  assert.ok(r.solPremiumPct > 100);
});

check("coding prompt with a stack trace routes at least Terra", () => {
  const r = inspect({
    prompt:
      "Debug this TypeError: ```ts\nconst x = user.profile.name;\nconsole.log(x)\n``` — it crashes when profile is undefined. Fix the code.",
  });
  assert.ok(r.tier === "terra" || r.tier === "sol");
  assert.ok(r.reasons.some((x) => x.includes("code")));
});

check("architecture prompt routes to Sol", () => {
  const r = inspect({
    prompt:
      "Architect a distributed event-driven system that scales to 100k req/s with failover across regions. Discuss trade-offs of microservices vs modular monolith, design the consistency model, and think step by step through failure scenarios.",
  });
  assert.equal(r.tier, "sol");
  assert.equal(r.reasoning, "high");
});

check("images force a Terra floor", () => {
  const r = inspect({
    messages: [
      { role: "user", content: [{ type: "text", text: "What does this say?" }, { type: "image_url", image_url: { url: "data:..." } }] },
    ],
  });
  assert.ok(r.tier === "terra" || r.tier === "sol");
  assert.ok(r.reasons.some((x) => x.includes("image")));
});

check("many tools force a Terra floor", () => {
  const r = inspect({
    prompt: "Handle this request.",
    tools: [{}, {}, {}, {}],
  });
  assert.ok(r.tier === "terra" || r.tier === "sol");
});

check("cost math is sane", () => {
  const luna = estimateCostUsd("luna", 1000, 500);
  const sol = estimateCostUsd("sol", 1000, 500);
  assert.ok(sol > luna * 10);
  assert.ok(Math.abs(luna - 0.0012) < 1e-9);
});

check("token estimation is roughly chars/4", () => {
  assert.equal(estimateTokens("a".repeat(400)), 100);
  const n = normalizeInput({ messages: [{ role: "user", content: "hello" }] });
  assert.equal(n.text, "hello");
});

check("model name parsing", () => {
  assert.equal(parseModelTier("gpt-5.6-auto"), "auto");
  assert.equal(parseModelTier("gpt-5.6-luna"), "luna");
  assert.equal(parseModelTier(undefined), "auto");
});

check("optimizer trims few-shot bloat and projects savings", () => {
  const fewShot = [
    "Classify the sentiment of each message.",
    "Example 1: 'I love this' → positive",
    "Example 2: 'terrible, broke instantly' → negative",
    "Example 3: 'works as expected' → positive",
    "Example 4: 'worst purchase ever' → negative",
    "Example 5: 'absolutely fantastic support' → positive",
    "Now classify: 'meh, it is okay I guess'",
  ].join("\n");
  const suggestions = optimizePrompt({ prompt: fewShot });
  const trim = suggestions.find((s) => s.id === "trim-few-shot");
  assert.ok(trim, "expected a trim-few-shot suggestion");
  assert.ok(trim!.rewrite && trim!.rewrite.length < fewShot.length);
});

check("optimizer drops deep-think phrasing when it inflates the tier", () => {
  const config =
    "server {\n  listen 80;\n  server_name example.com;\n  keepalive_timeout 65;\n  gzip on;\n  client_max_body_size 50m;\n}\n".repeat(25);
  const prompt = `Think step by step: review the following nginx config and tell me if anything looks off.\n\n${config}`;
  const before = inspect({ prompt });
  assert.equal(before.tier, "terra");
  const suggestions = optimizePrompt({ prompt });
  const drop = suggestions.find((s) => s.id === "drop-deep-think");
  assert.ok(drop, "expected a drop-deep-think suggestion");
  assert.equal(drop!.projectedTier, "luna");
});

check("db logging + dashboard stats + waste detection", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pi-test-"));
  process.env.PROMPT_INSPECTOR_DB = path.join(dir, "test.db");
  const db = getDb();
  const inspection = inspect({ prompt: "Translate 'good morning' to French." });
  logRequest(db, {
    id: "test-1",
    ts: Date.now(),
    project: "tests",
    api: "chat",
    requestedModel: "gpt-5.6-sol",
    routedTier: "sol",
    recommendedTier: inspection.tier,
    upstreamModel: "demo-sol",
    taskType: inspection.taskType,
    reasons: inspection.reasons,
    confidence: inspection.confidence,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.003,
    solCostUsd: 0.003,
    savedUsd: 0.02,
    latencyMs: 900,
    status: "ok",
    streaming: false,
    forced: true,
    hadTools: false,
    hadImages: false,
  });
  const stats = getDashboardStats(db);
  assert.equal(stats.totals.requests, 1);
  assert.ok(stats.waste.headline !== null); // routed sol, classifier said cheaper
});

check("seed generates deterministic demo data", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pi-seed-"));
  process.env.PROMPT_INSPECTOR_DB = path.join(dir, "seed.db");
  const first = seedDemoData(true);
  assert.ok(first.inserted > 400, `expected hundreds of rows, got ${first.inserted}`);
  const stats = getDashboardStats(getDb());
  assert.ok(stats.totals.savingsPct > 20);
  assert.ok(stats.daily.length >= 10);
  assert.ok(stats.projects.length >= 3);
});

console.log(failures === 0 ? "\nAll core tests passed." : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
