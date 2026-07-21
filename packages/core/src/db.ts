import Database from "better-sqlite3";
import dotenv from "dotenv";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type {
  DashboardStats,
  RequestLogEntry,
  Tier,
} from "./types.js";

/**
 * Dual-backend storage. When DATABASE_URL is set (Supabase Postgres, via the
 * transaction pooler) all reads and writes go to Postgres; otherwise we fall
 * back to one shared SQLite file at the repo root — zero config, auto-created.
 * The proxy is the only writer, the web dashboard reads. WAL mode keeps
 * concurrent SQLite access safe.
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

// The repo-root .env carries DATABASE_URL; dotenv never overwrites a key that
// is already set, so the real environment always wins.
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = findRepoRoot(process.cwd()) ?? findRepoRoot(here);
  if (root) dotenv.config({ path: path.join(root, ".env") });
}

export function resolveDbPath(): string {
  if (process.env.PROMPT_INSPECTOR_DB) return process.env.PROMPT_INSPECTOR_DB;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = findRepoRoot(process.cwd()) ?? findRepoRoot(here) ?? process.cwd();
  return path.join(root, ".data", DB_FILENAME);
}

type Pg = ReturnType<typeof postgres>;

/** Storage handle. Backend is chosen per getDb() call from DATABASE_URL. */
export type Db =
  | { kind: "sqlite"; sqlite: Database.Database }
  | { kind: "postgres"; pg: Pg };

const sqliteConnections = new Map<string, Database.Database>();

function getSqlite(dbPath: string): Database.Database {
  const existing = sqliteConnections.get(dbPath);
  if (existing) return existing;
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrateSqlite(db);
  sqliteConnections.set(dbPath, db);
  return db;
}

function migrateSqlite(d: Database.Database): void {
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

let pgClient: Pg | null = null;
let pgReady: Promise<Pg> | null = null;

/** Lazy singleton, tuned for the Supabase transaction pooler. */
function getPg(): Promise<Pg> {
  if (!pgReady) {
    const client = postgres(process.env.DATABASE_URL as string, {
      // PgBouncer in transaction mode can't hold prepared statements.
      prepare: false,
      ssl: "require",
      // Serverless: many warm instances, few connections each.
      max: 3,
    });
    pgClient = client;
    pgReady = migratePg(client).then(() => client);
  }
  return pgReady;
}

async function migratePg(pg: Pg): Promise<void> {
  // Same schema as SQLite, with dialect fixes: BIGINT for epoch ms,
  // DOUBLE PRECISION for REAL.
  await pg`
    CREATE TABLE IF NOT EXISTS requests (
      id               TEXT PRIMARY KEY,
      ts               BIGINT NOT NULL,
      project          TEXT NOT NULL DEFAULT 'default',
      api              TEXT NOT NULL,
      requested_model  TEXT NOT NULL,
      routed_tier      TEXT NOT NULL,
      recommended_tier TEXT NOT NULL,
      upstream_model   TEXT NOT NULL,
      task_type        TEXT NOT NULL,
      reasons          TEXT NOT NULL,
      confidence       DOUBLE PRECISION NOT NULL,
      input_tokens     INTEGER NOT NULL,
      output_tokens    INTEGER NOT NULL,
      cost_usd         DOUBLE PRECISION NOT NULL,
      sol_cost_usd     DOUBLE PRECISION NOT NULL,
      saved_usd        DOUBLE PRECISION NOT NULL,
      latency_ms       INTEGER NOT NULL,
      status           TEXT NOT NULL,
      streaming        INTEGER NOT NULL DEFAULT 0,
      forced           INTEGER NOT NULL DEFAULT 0,
      had_tools        INTEGER NOT NULL DEFAULT 0,
      had_images       INTEGER NOT NULL DEFAULT 0
    )`;
  await pg`CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts)`;
  await pg`CREATE INDEX IF NOT EXISTS idx_requests_project ON requests(project)`;
  await pg`
    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id        TEXT PRIMARY KEY,
      ts        BIGINT NOT NULL,
      item_id   TEXT NOT NULL,
      category  TEXT NOT NULL,
      mode      TEXT NOT NULL DEFAULT 'demo'
    )`;
  await pg`CREATE INDEX IF NOT EXISTS idx_bench_runs_ts ON benchmark_runs(ts)`;
  await pg`
    CREATE TABLE IF NOT EXISTS benchmark_results (
      run_id         TEXT NOT NULL REFERENCES benchmark_runs(id),
      tier           TEXT NOT NULL,
      latency_ms     INTEGER,
      cost_usd       DOUBLE PRECISION,
      output_preview TEXT,
      quality        DOUBLE PRECISION,
      status         TEXT NOT NULL,
      PRIMARY KEY (run_id, tier)
    )`;
}

export async function getDb(dbPath: string = resolveDbPath()): Promise<Db> {
  if (process.env.DATABASE_URL) return { kind: "postgres", pg: await getPg() };
  return { kind: "sqlite", sqlite: getSqlite(dbPath) };
}

/** Graceful shutdown for CLI runs — servers just let the process die. */
export async function closeDb(): Promise<void> {
  if (pgClient) {
    await pgClient.end({ timeout: 5 });
    pgClient = null;
    pgReady = null;
  }
  // SQLite handles are process-lifetime; nothing to do.
}

interface Row {
  [key: string]: unknown;
}

/** Postgres may surface BIGINT/COUNT as string or BigInt — normalize. */
function num(x: unknown): number {
  return Number(x ?? 0);
}

/** Maps a log entry to its snake_case row (shared by both backends). */
export function requestRow(entry: RequestLogEntry): Row {
  return {
    id: entry.id,
    ts: entry.ts,
    project: entry.project,
    api: entry.api,
    requested_model: entry.requestedModel,
    routed_tier: entry.routedTier,
    recommended_tier: entry.recommendedTier,
    upstream_model: entry.upstreamModel,
    task_type: entry.taskType,
    reasons: JSON.stringify(entry.reasons),
    confidence: entry.confidence,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cost_usd: entry.costUsd,
    sol_cost_usd: entry.solCostUsd,
    saved_usd: entry.savedUsd,
    latency_ms: entry.latencyMs,
    status: entry.status,
    streaming: entry.streaming ? 1 : 0,
    forced: entry.forced ? 1 : 0,
    had_tools: entry.hadTools ? 1 : 0,
    had_images: entry.hadImages ? 1 : 0,
  };
}

export async function logRequest(
  d: Db,
  entry: RequestLogEntry,
): Promise<void> {
  const row = requestRow(entry);
  if (d.kind === "postgres") {
    await d.pg`INSERT INTO requests ${d.pg(row)}`;
    return;
  }
  d.sqlite
    .prepare(
      `INSERT INTO requests (
        id, ts, project, api, requested_model, routed_tier, recommended_tier,
        upstream_model, task_type, reasons, confidence, input_tokens,
        output_tokens, cost_usd, sol_cost_usd, saved_usd, latency_ms, status,
        streaming, forced, had_tools, had_images
      ) VALUES (
        @id, @ts, @project, @api, @requested_model, @routed_tier, @recommended_tier,
        @upstream_model, @task_type, @reasons, @confidence, @input_tokens,
        @output_tokens, @cost_usd, @sol_cost_usd, @saved_usd, @latency_ms, @status,
        @streaming, @forced, @had_tools, @had_images
      )`,
    )
    .run(row);
}

function toEntry(row: Row): RequestLogEntry {
  return {
    id: row.id as string,
    ts: num(row.ts),
    project: row.project as string,
    api: row.api as RequestLogEntry["api"],
    requestedModel: row.requested_model as string,
    routedTier: row.routed_tier as Tier,
    recommendedTier: row.recommended_tier as Tier,
    upstreamModel: row.upstream_model as string,
    taskType: row.task_type as RequestLogEntry["taskType"],
    reasons: JSON.parse((row.reasons as string) ?? "[]") as string[],
    confidence: num(row.confidence),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    costUsd: num(row.cost_usd),
    solCostUsd: num(row.sol_cost_usd),
    savedUsd: num(row.saved_usd),
    latencyMs: num(row.latency_ms),
    status: row.status as RequestLogEntry["status"],
    streaming: Boolean(row.streaming),
    forced: Boolean(row.forced),
    hadTools: Boolean(row.had_tools),
    hadImages: Boolean(row.had_images),
  };
}

export async function recentRequests(
  d: Db,
  limit = 50,
): Promise<RequestLogEntry[]> {
  const rows =
    d.kind === "postgres"
      ? await d.pg<Row[]>`SELECT * FROM requests ORDER BY ts DESC LIMIT ${limit}`
      : (d.sqlite
          .prepare(`SELECT * FROM requests ORDER BY ts DESC LIMIT ?`)
          .all(limit) as Row[]);
  return rows.map(toEntry);
}

export async function isSeeded(d: Db): Promise<boolean> {
  const row =
    d.kind === "postgres"
      ? (await d.pg<Row[]>`SELECT COUNT(*) AS n FROM requests`)[0]
      : (d.sqlite.prepare(`SELECT COUNT(*) AS n FROM requests`).get() as Row);
  return num(row?.n) > 0;
}

/** Demo mode: every logged request rode a simulated upstream. */
export async function isAllDemoTraffic(d: Db): Promise<boolean> {
  const row =
    d.kind === "postgres"
      ? (
          await d.pg<Row[]>`
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(CASE WHEN upstream_model LIKE 'demo-%' THEN 1 ELSE 0 END), 0) AS demos
            FROM requests`
        )[0]
      : (d.sqlite
          .prepare(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN upstream_model LIKE 'demo-%' THEN 1 ELSE 0 END), 0) AS demos
             FROM requests`,
          )
          .get() as Row);
  return num(row?.total) > 0 && num(row?.demos) === num(row?.total);
}

interface StatsRows {
  totals: Row | undefined;
  tierRows: Row[];
  dailyRows: Row[];
  projectRows: Row[];
  wasteRow: Row | undefined;
  expensiveRows: Row[];
}

async function statsRowsSqlite(d: Database.Database): Promise<StatsRows> {
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

  const expensiveRows = d
    .prepare(
      `SELECT * FROM requests WHERE status != 'error'
       ORDER BY cost_usd DESC LIMIT 10`,
    )
    .all() as Row[];

  return { totals, tierRows, dailyRows, projectRows, wasteRow, expensiveRows };
}

async function statsRowsPg(pg: Pg): Promise<StatsRows> {
  const [totals] = await pg<Row[]>`
    SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd),0) AS spend,
           COALESCE(SUM(sol_cost_usd),0) AS baseline,
           COALESCE(SUM(saved_usd),0) AS saved,
           COALESCE(AVG(latency_ms),0) AS avg_latency
    FROM requests WHERE status != 'error'`;

  const tierRows = await pg<Row[]>`
    SELECT routed_tier AS tier, COUNT(*) AS requests,
           COALESCE(SUM(cost_usd),0) AS cost
    FROM requests WHERE status != 'error' GROUP BY routed_tier`;

  const dailyRows = await pg<Row[]>`
    SELECT to_char(to_timestamp(ts / 1000.0), 'YYYY-MM-DD') AS day,
           COUNT(*) AS requests,
           COALESCE(SUM(cost_usd),0) AS cost, COALESCE(SUM(saved_usd),0) AS saved
    FROM requests WHERE status != 'error'
    GROUP BY day ORDER BY day DESC LIMIT 30`;

  const projectRows = await pg<Row[]>`
    SELECT project, COUNT(*) AS requests, COALESCE(SUM(cost_usd),0) AS cost,
           COALESCE(SUM(saved_usd),0) AS saved
    FROM requests WHERE status != 'error'
    GROUP BY project ORDER BY cost DESC LIMIT 8`;

  // Waste detection: requests that rode Sol while the classifier said cheaper.
  const [wasteRow] = await pg<Row[]>`
    SELECT COUNT(*) AS sol_requests,
           COALESCE(SUM(saved_usd),0) AS wasted,
           COUNT(*) * 1.0 / GREATEST(1, (SELECT COUNT(*) FROM requests WHERE status != 'error')) AS sol_share,
           (MAX(ts) - MIN(ts)) AS span_ms
    FROM requests
    WHERE status != 'error' AND routed_tier = 'sol' AND recommended_tier != 'sol'`;

  const expensiveRows = await pg<Row[]>`
    SELECT * FROM requests WHERE status != 'error'
    ORDER BY cost_usd DESC LIMIT 10`;

  return { totals, tierRows, dailyRows, projectRows, wasteRow, expensiveRows };
}

export async function getDashboardStats(d: Db): Promise<DashboardStats> {
  const { totals, tierRows, dailyRows, projectRows, wasteRow, expensiveRows } =
    d.kind === "postgres"
      ? await statsRowsPg(d.pg)
      : await statsRowsSqlite(d.sqlite);

  const spanDays = Math.max(1, num(wasteRow?.span_ms) / 86_400_000);
  const wasted = num(wasteRow?.wasted);
  const solShare = num(wasteRow?.sol_share);
  const monthlyWaste = (wasted / spanDays) * 30;
  const headline =
    wasted > 0.005
      ? `You use Sol for ${Math.round(solShare * 100)}% of traffic that doesn't need it. Estimated unnecessary spend: $${monthlyWaste.toFixed(2)}/month.`
      : null;

  const spend = num(totals?.spend);
  const baseline = num(totals?.baseline);

  return {
    totals: {
      requests: num(totals?.requests),
      spendUsd: spend,
      solBaselineUsd: baseline,
      savedUsd: num(totals?.saved),
      savingsPct: baseline > 0 ? Math.round(((baseline - spend) / baseline) * 100) : 0,
      avgLatencyMs: Math.round(num(totals?.avg_latency)),
    },
    tierDistribution: tierRows.map((r) => ({
      tier: r.tier as Tier,
      requests: num(r.requests),
      costUsd: num(r.cost),
    })),
    daily: dailyRows
      .map((r) => ({
        day: r.day as string,
        requests: num(r.requests),
        costUsd: num(r.cost),
        savedUsd: num(r.saved),
      }))
      .reverse(),
    projects: projectRows.map((r) => ({
      project: r.project as string,
      requests: num(r.requests),
      costUsd: num(r.cost),
      savedUsd: num(r.saved),
    })),
    waste: {
      solRequests: num(wasteRow?.sol_requests),
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

export async function recordBenchmarkRun(
  d: Db,
  run: { id: string; ts: number; itemId: string; category: string; mode: string },
  results: BenchmarkRunRow["results"],
): Promise<void> {
  if (d.kind === "postgres") {
    await d.pg.begin(async (tx) => {
      await tx`INSERT INTO benchmark_runs ${tx({
        id: run.id,
        ts: run.ts,
        item_id: run.itemId,
        category: run.category,
        mode: run.mode,
      })}`;
      for (const r of results) {
        await tx`INSERT INTO benchmark_results ${tx({
          run_id: run.id,
          tier: r.tier,
          latency_ms: r.latencyMs,
          cost_usd: r.costUsd,
          output_preview: r.outputPreview,
          quality: r.quality,
          status: r.status,
        })}`;
      }
    });
    return;
  }
  const insertRun = d.sqlite.prepare(
    `INSERT INTO benchmark_runs (id, ts, item_id, category, mode)
     VALUES (@id, @ts, @itemId, @category, @mode)`,
  );
  const insertResult = d.sqlite.prepare(
    `INSERT INTO benchmark_results
       (run_id, tier, latency_ms, cost_usd, output_preview, quality, status)
     VALUES (@runId, @tier, @latencyMs, @costUsd, @outputPreview, @quality, @status)`,
  );
  d.sqlite.transaction(() => {
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

export async function benchmarkHistory(
  d: Db,
  limit = 20,
): Promise<BenchmarkRunRow[]> {
  const runs =
    d.kind === "postgres"
      ? await d.pg<Row[]>`SELECT * FROM benchmark_runs ORDER BY ts DESC LIMIT ${limit}`
      : (d.sqlite
          .prepare(`SELECT * FROM benchmark_runs ORDER BY ts DESC LIMIT ?`)
          .all(limit) as Row[]);

  let resultRows: Row[];
  if (d.kind === "postgres") {
    const ids = runs.map((r) => r.id as string);
    resultRows =
      ids.length === 0
        ? []
        : await d.pg<Row[]>`SELECT * FROM benchmark_results WHERE run_id IN ${d.pg(ids)}`;
  } else {
    const resultStmt = d.sqlite.prepare(
      `SELECT * FROM benchmark_results WHERE run_id = ?`,
    );
    resultRows = runs.flatMap(
      (r) => resultStmt.all(r.id) as Row[],
    );
  }

  const resultsByRun = new Map<string, Row[]>();
  for (const x of resultRows) {
    const list = resultsByRun.get(x.run_id as string) ?? [];
    list.push(x);
    resultsByRun.set(x.run_id as string, list);
  }

  return runs.map((r) => ({
    id: r.id as string,
    ts: num(r.ts),
    itemId: r.item_id as string,
    category: r.category as string,
    mode: r.mode as string,
    results: (resultsByRun.get(r.id as string) ?? []).map((x) => ({
      tier: x.tier as Tier,
      latencyMs: x.latency_ms === null ? null : num(x.latency_ms),
      costUsd: x.cost_usd === null ? null : num(x.cost_usd),
      outputPreview: x.output_preview as string | null,
      quality: x.quality === null ? null : num(x.quality),
      status: x.status as string,
    })),
  }));
}
