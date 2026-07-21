import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DashboardStats,
  RequestLogEntry,
  Tier,
} from "./types.js";

/**
 * SQLite storage. One shared file at the repo root; the proxy is the only
 * writer, the web dashboard reads. WAL mode keeps concurrent access safe.
 */

export const DB_FILENAME = "prompt-inspector.db";

function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export function resolveDbPath(): string {
  if (process.env.PROMPT_INSPECTOR_DB) return process.env.PROMPT_INSPECTOR_DB;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = findRepoRoot(process.cwd()) ?? findRepoRoot(here) ?? process.cwd();
  return path.join(root, ".data", DB_FILENAME);
}

const connections = new Map<string, Database.Database>();

export function getDb(dbPath: string = resolveDbPath()): Database.Database {
  const existing = connections.get(dbPath);
  if (existing) return existing;
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  connections.set(dbPath, db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id               TEXT PRIMARY KEY,
      ts               INTEGER NOT NULL,
      project          TEXT NOT NULL DEFAULT 'default',
      api              TEXT NOT NULL,
      requested_model  TEXT NOT NULL,
      routed_tier      TEXT NOT NULL,
      recommended_tier TEXT NOT NULL,
      upstream_model   TEXT NOT NULL,
      task_type        TEXT NOT NULL,
      reasons          TEXT NOT NULL,
      confidence       REAL NOT NULL,
      input_tokens     INTEGER NOT NULL,
      output_tokens    INTEGER NOT NULL,
      cost_usd         REAL NOT NULL,
      sol_cost_usd     REAL NOT NULL,
      saved_usd        REAL NOT NULL,
      latency_ms       INTEGER NOT NULL,
      status           TEXT NOT NULL,
      streaming        INTEGER NOT NULL DEFAULT 0,
      forced           INTEGER NOT NULL DEFAULT 0,
      had_tools        INTEGER NOT NULL DEFAULT 0,
      had_images       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
    CREATE INDEX IF NOT EXISTS idx_requests_project ON requests(project);

    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id        TEXT PRIMARY KEY,
      ts        INTEGER NOT NULL,
      item_id   TEXT NOT NULL,
      category  TEXT NOT NULL,
      mode      TEXT NOT NULL DEFAULT 'demo'
    );
    CREATE INDEX IF NOT EXISTS idx_bench_runs_ts ON benchmark_runs(ts);

    CREATE TABLE IF NOT EXISTS benchmark_results (
      run_id         TEXT NOT NULL REFERENCES benchmark_runs(id),
      tier           TEXT NOT NULL,
      latency_ms     INTEGER,
      cost_usd       REAL,
      output_preview TEXT,
      quality        REAL,
      status         TEXT NOT NULL,
      PRIMARY KEY (run_id, tier)
    );
  `);
}

export function logRequest(
  d: Database.Database,
  entry: RequestLogEntry,
): void {
  d.prepare(
    `INSERT INTO requests (
      id, ts, project, api, requested_model, routed_tier, recommended_tier,
      upstream_model, task_type, reasons, confidence, input_tokens,
      output_tokens, cost_usd, sol_cost_usd, saved_usd, latency_ms, status,
      streaming, forced, had_tools, had_images
    ) VALUES (
      @id, @ts, @project, @api, @requestedModel, @routedTier, @recommendedTier,
      @upstreamModel, @taskType, @reasons, @confidence, @inputTokens,
      @outputTokens, @costUsd, @solCostUsd, @savedUsd, @latencyMs, @status,
      @streaming, @forced, @hadTools, @hadImages
    )`,
  ).run({
    ...entry,
    reasons: JSON.stringify(entry.reasons),
    streaming: entry.streaming ? 1 : 0,
    forced: entry.forced ? 1 : 0,
    hadTools: entry.hadTools ? 1 : 0,
    hadImages: entry.hadImages ? 1 : 0,
  });
}

interface Row {
  [key: string]: unknown;
}

function toEntry(row: Row): RequestLogEntry {
  return {
    id: row.id as string,
    ts: row.ts as number,
    project: row.project as string,
    api: row.api as RequestLogEntry["api"],
    requestedModel: row.requested_model as string,
    routedTier: row.routed_tier as Tier,
    recommendedTier: row.recommended_tier as Tier,
    upstreamModel: row.upstream_model as string,
    taskType: row.task_type as RequestLogEntry["taskType"],
    reasons: JSON.parse((row.reasons as string) ?? "[]") as string[],
    confidence: row.confidence as number,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    costUsd: row.cost_usd as number,
    solCostUsd: row.sol_cost_usd as number,
    savedUsd: row.saved_usd as number,
    latencyMs: row.latency_ms as number,
    status: row.status as RequestLogEntry["status"],
    streaming: Boolean(row.streaming),
    forced: Boolean(row.forced),
    hadTools: Boolean(row.had_tools),
    hadImages: Boolean(row.had_images),
  };
}

export function recentRequests(
  d: Database.Database,
  limit = 50,
): RequestLogEntry[] {
  const rows = d
    .prepare(`SELECT * FROM requests ORDER BY ts DESC LIMIT ?`)
    .all(limit) as Row[];
  return rows.map(toEntry);
}

export function isSeeded(d: Database.Database): boolean {
  const row = d.prepare(`SELECT COUNT(*) AS n FROM requests`).get() as Row;
  return (row.n as number) > 0;
}

export function getDashboardStats(d: Database.Database): DashboardStats {
  const totals = d
    .prepare(
      `SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd),0) AS spend,
              COALESCE(SUM(sol_cost_usd),0) AS baseline,
              COALESCE(SUM(saved_usd),0) AS saved,
              COALESCE(AVG(latency_ms),0) AS avg_latency
       FROM requests WHERE status != 'error'`,
    )
    .get() as Row;

  const tierRows = d
    .prepare(
      `SELECT routed_tier AS tier, COUNT(*) AS requests,
              COALESCE(SUM(cost_usd),0) AS cost
       FROM requests WHERE status != 'error' GROUP BY routed_tier`,
    )
    .all() as Row[];

  const dailyRows = d
    .prepare(
      `SELECT date(ts/1000, 'unixepoch') AS day, COUNT(*) AS requests,
              COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(saved_usd),0) AS saved
       FROM requests WHERE status != 'error'
       GROUP BY day ORDER BY day DESC LIMIT 30`,
    )
    .all() as Row[];

  const projectRows = d
    .prepare(
      `SELECT project, COUNT(*) AS requests, COALESCE(SUM(cost_usd),0) AS cost,
              COALESCE(SUM(saved_usd),0) AS saved
       FROM requests WHERE status != 'error'
       GROUP BY project ORDER BY cost DESC LIMIT 8`,
    )
    .all() as Row[];

  // Waste detection: requests that rode Sol while the classifier said cheaper.
  const wasteRow = d
    .prepare(
      `SELECT COUNT(*) AS sol_requests,
              COALESCE(SUM(saved_usd),0) AS wasted,
              COUNT(*) * 1.0 / MAX(1, (SELECT COUNT(*) FROM requests WHERE status != 'error')) AS sol_share,
              (MAX(ts) - MIN(ts)) AS span_ms
       FROM requests
       WHERE status != 'error' AND routed_tier = 'sol' AND recommended_tier != 'sol'`,
    )
    .get() as Row;

  const spanDays = Math.max(1, ((wasteRow?.span_ms as number) ?? 0) / 86_400_000);
  const wasted = (wasteRow?.wasted as number) ?? 0;
  const solShare = (wasteRow?.sol_share as number) ?? 0;
  const monthlyWaste = (wasted / spanDays) * 30;
  const headline =
    wasted > 0.005
      ? `You use Sol for ${Math.round(solShare * 100)}% of traffic that doesn't need it. Estimated unnecessary spend: $${monthlyWaste.toFixed(2)}/month.`
      : null;

  const expensiveRows = d
    .prepare(
      `SELECT * FROM requests WHERE status != 'error'
       ORDER BY cost_usd DESC LIMIT 10`,
    )
    .all() as Row[];

  const spend = totals.spend as number;
  const baseline = totals.baseline as number;

  return {
    totals: {
      requests: totals.requests as number,
      spendUsd: spend,
      solBaselineUsd: baseline,
      savedUsd: totals.saved as number,
      savingsPct: baseline > 0 ? Math.round(((baseline - spend) / baseline) * 100) : 0,
      avgLatencyMs: Math.round(totals.avg_latency as number),
    },
    tierDistribution: tierRows.map((r) => ({
      tier: r.tier as Tier,
      requests: r.requests as number,
      costUsd: r.cost as number,
    })),
    daily: dailyRows
      .map((r) => ({
        day: r.day as string,
        requests: r.requests as number,
        costUsd: r.cost as number,
        savedUsd: r.saved as number,
      }))
      .reverse(),
    projects: projectRows.map((r) => ({
      project: r.project as string,
      requests: r.requests as number,
      costUsd: r.cost as number,
      savedUsd: r.saved as number,
    })),
    waste: {
      solRequests: (wasteRow?.sol_requests as number) ?? 0,
      wastedOnSolUsd: wasted,
      projectedMonthlyWasteUsd: monthlyWaste,
      headline,
    },
    mostExpensive: expensiveRows.map(toEntry),
    demo: false,
  };
}

export interface BenchmarkRunRow {
  id: string;
  ts: number;
  itemId: string;
  category: string;
  mode: string;
  results: {
    tier: Tier;
    latencyMs: number | null;
    costUsd: number | null;
    outputPreview: string | null;
    quality: number | null;
    status: string;
  }[];
}

export function recordBenchmarkRun(
  d: Database.Database,
  run: { id: string; ts: number; itemId: string; category: string; mode: string },
  results: BenchmarkRunRow["results"],
): void {
  const insertRun = d.prepare(
    `INSERT INTO benchmark_runs (id, ts, item_id, category, mode)
     VALUES (@id, @ts, @itemId, @category, @mode)`,
  );
  const insertResult = d.prepare(
    `INSERT INTO benchmark_results
       (run_id, tier, latency_ms, cost_usd, output_preview, quality, status)
     VALUES (@runId, @tier, @latencyMs, @costUsd, @outputPreview, @quality, @status)`,
  );
  d.transaction(() => {
    insertRun.run(run);
    for (const r of results) {
      insertResult.run({
        runId: run.id,
        tier: r.tier,
        latencyMs: r.latencyMs,
        costUsd: r.costUsd,
        outputPreview: r.outputPreview,
        quality: r.quality,
        status: r.status,
      });
    }
  })();
}

export function benchmarkHistory(
  d: Database.Database,
  limit = 20,
): BenchmarkRunRow[] {
  const runs = d
    .prepare(`SELECT * FROM benchmark_runs ORDER BY ts DESC LIMIT ?`)
    .all(limit) as Row[];
  const resultStmt = d.prepare(
    `SELECT * FROM benchmark_results WHERE run_id = ?`,
  );
  return runs.map((r) => ({
    id: r.id as string,
    ts: r.ts as number,
    itemId: r.item_id as string,
    category: r.category as string,
    mode: r.mode as string,
    results: (resultStmt.all(r.id) as Row[]).map((x) => ({
      tier: x.tier as Tier,
      latencyMs: x.latency_ms as number | null,
      costUsd: x.cost_usd as number | null,
      outputPreview: x.output_preview as string | null,
      quality: x.quality as number | null,
      status: x.status as string,
    })),
  }));
}
