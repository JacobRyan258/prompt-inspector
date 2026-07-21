import {
  BENCHMARK_CATEGORIES,
  BENCHMARKS,
} from "@prompt-inspector/core/benchmarks";
import { inspect } from "@prompt-inspector/core/classify";
import { benchmarkHistory, getDb } from "@prompt-inspector/core/db";
import type { Metadata } from "next";
import { BenchmarkCard } from "@/components/benchmark-card";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fakeTools, toolCountFor } from "@/lib/benchmarks";
import { formatLatency, formatUsd, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Benchmarks" };

const TIER_INITIAL: Record<string, string> = { luna: "L", terra: "T", sol: "S" };

export default async function BenchmarksPage() {
  // Router accuracy: predict every item's tier and compare with the human label.
  const predictions = new Map(
    BENCHMARKS.map((item) => {
      const tools = fakeTools(toolCountFor(item.id));
      const inspection = inspect({ prompt: item.prompt, tools });
      return [item.id, inspection.tier] as const;
    }),
  );
  const matches = BENCHMARKS.filter(
    (item) => predictions.get(item.id) === item.expectedTier,
  ).length;

  const db = await getDb();
  const history = await benchmarkHistory(db, 10);
  const titleOf = new Map(BENCHMARKS.map((b) => [b.id, b.title] as const));

  return (
    <div className="flex flex-col gap-10 py-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Benchmarks
        </h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Thirty prompts, ten categories, human-labeled with the cheapest tier
          that should handle each. Run any of them against all three tiers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Prompts" value={String(BENCHMARKS.length)} />
        <StatCard label="Categories" value={String(BENCHMARK_CATEGORIES.length)} />
        <StatCard
          label="Router accuracy"
          value={`${matches}/${BENCHMARKS.length}`}
          sub="router agrees with human labels"
        />
      </div>

      {BENCHMARK_CATEGORIES.map((category) => {
        const items = BENCHMARKS.filter((b) => b.category === category);
        return (
          <section key={category} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-medium tracking-tight text-zinc-100">
                {category}
              </h2>
              <span className="text-xs text-zinc-500">
                {items.length} prompts
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <BenchmarkCard
                  key={item.id}
                  itemId={item.id}
                  title={item.title}
                  expectedTier={item.expectedTier}
                  predictedTier={predictions.get(item.id) ?? item.expectedTier}
                  preview={
                    item.prompt.length > 240
                      ? `${item.prompt.slice(0, 240)}…`
                      : item.prompt
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No runs yet. Hit Run on any benchmark above.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-800/60">
              {history.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="w-16 text-xs text-zinc-500">
                    {timeAgo(run.ts)}
                  </span>
                  <span className="text-sm text-zinc-200">
                    {titleOf.get(run.itemId) ?? run.itemId}
                  </span>
                  <Badge variant={run.mode === "live" ? "success" : "muted"}>
                    {run.mode}
                  </Badge>
                  <span className="ml-auto font-mono text-[11px] text-zinc-500">
                    {run.results
                      .map(
                        (r) =>
                          `${TIER_INITIAL[r.tier] ?? r.tier} ${
                            r.latencyMs != null ? formatLatency(r.latencyMs) : "—"
                          } ${r.costUsd != null ? formatUsd(r.costUsd) : "—"}`,
                      )
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
