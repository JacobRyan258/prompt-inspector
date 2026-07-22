import {
  getDashboardStats,
  getDb,
  isAllDemoTraffic,
  isSeeded,
  recentRequests,
  seedDemoData,
} from "@prompt-inspector/core";
import type { Metadata } from "next";
import { CircleCheck, TriangleAlert, TrendingDown, TrendingUp } from "lucide-react";
import { DailyChart } from "@/components/dashboard/daily-chart";
import { RoutingTable } from "@/components/dashboard/routing-table";
import { TierDonut } from "@/components/dashboard/tier-donut";
import { DemoBanner } from "@/components/demo-banner";
import { StatCard } from "@/components/stat-card";
import { TierBadge } from "@/components/tier-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLatency, formatUsd, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Spending" };

/** Savings-rate trend: last 7 days vs. the 7 before, in percentage points. */
function savingsTrend(daily: { costUsd: number; savedUsd: number }[]) {
  const share = (rows: { costUsd: number; savedUsd: number }[]) => {
    const cost = rows.reduce((s, r) => s + r.costUsd, 0);
    const saved = rows.reduce((s, r) => s + r.savedUsd, 0);
    return cost + saved > 0 ? saved / (cost + saved) : null;
  };
  const recent = share(daily.slice(-7));
  const previous = share(daily.slice(-14, -7));
  if (recent === null || previous === null) return null;
  return Math.round((recent - previous) * 1000) / 10;
}

export default async function DashboardPage() {
  const db = await getDb();
  // Auto-seed demo data only for zero-config local SQLite. A configured
  // Postgres starts empty and fills with real proxy traffic.
  if (!process.env.DATABASE_URL && !(await isSeeded(db))) await seedDemoData();

  const stats = await getDashboardStats(db);
  const recent = await recentRequests(db, 50);

  // Demo mode: every logged request rode a simulated upstream.
  stats.demo = await isAllDemoTraffic(db);

  const { totals } = stats;
  const trend = savingsTrend(stats.daily);
  const maxProjectCost = Math.max(...stats.projects.map((p) => p.costUsd), 0);

  return (
    <div className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Spending
        </h1>
        <p className="text-sm text-zinc-400">
          Every request the proxy routed, priced against the all-Sol baseline.
        </p>
      </div>

      {stats.demo && <DemoBanner />}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total spend"
          value={formatUsd(totals.spendUsd)}
          sub={
            <>
              vs{" "}
              <span className="line-through">
                {formatUsd(totals.solBaselineUsd)}
              </span>{" "}
              all-Sol
            </>
          }
        />
        <StatCard
          label="Total saved"
          value={formatUsd(totals.savedUsd)}
          accent="emerald"
          sub="money that stayed in your pocket"
        />
        <StatCard
          label="Savings"
          value={`${totals.savingsPct}%`}
          sub={
            trend === null ? (
              "of the Sol baseline"
            ) : (
              <span className="inline-flex items-center gap-1">
                {trend >= 0 ? (
                  <TrendingUp className="size-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="size-3 text-amber-400" />
                )}
                {trend >= 0 ? "+" : ""}
                {trend} pts vs prior week
              </span>
            )
          }
        />
        <StatCard
          label="Requests"
          value={totals.requests.toLocaleString()}
          sub={`avg ${formatLatency(totals.avgLatencyMs)}`}
        />
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Daily spend vs. savings</CardTitle>
          <span className="text-xs text-zinc-500">last {stats.daily.length} days</span>
        </CardHeader>
        <CardContent>
          <DailyChart data={stats.daily} />
        </CardContent>
      </Card>

      {/* Distribution + waste */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Model distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <TierDonut data={stats.tierDistribution} />
          </CardContent>
        </Card>

        {stats.waste.headline ? (
          <Card className="border-amber-400/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-400">
                <TriangleAlert className="size-4" />
                Waste detected
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-zinc-300">
                {stats.waste.headline}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Sol joyrides", value: String(stats.waste.solRequests) },
                  { label: "Wasted so far", value: formatUsd(stats.waste.wastedOnSolUsd) },
                  {
                    label: "Projected / month",
                    value: formatUsd(stats.waste.projectedMonthlyWasteUsd),
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2.5"
                  >
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                      {s.label}
                    </div>
                    <div className="mt-0.5 text-sm font-medium tabular-nums text-amber-400">
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                Requests that rode Sol while the classifier recommended a cheaper
                tier. Usually a human pinning a model out of habit.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Waste detection</CardTitle>
            </CardHeader>
            <CardContent className="flex h-full items-center justify-center">
              <p className="flex items-center gap-2 text-sm text-emerald-400">
                <CircleCheck className="size-4" />
                No waste detected. Kimi approves.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Projects */}
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="w-2/5">Cost share</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Saved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.projects.map((project) => (
                <TableRow key={project.project}>
                  <TableCell className="font-mono text-xs">
                    {project.project}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {project.requests.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-zinc-400"
                        style={{
                          width: `${
                            maxProjectCost > 0
                              ? Math.max((project.costUsd / maxProjectCost) * 100, 2)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsd(project.costUsd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-400">
                    {formatUsd(project.savedUsd)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Decision inspector + most expensive */}
      <Tabs defaultValue="routing">
        <TabsList>
          <TabsTrigger value="routing">Routing history</TabsTrigger>
          <TabsTrigger value="expensive">Most expensive</TabsTrigger>
        </TabsList>
        <TabsContent value="routing">
          <Card>
            <CardHeader>
              <CardTitle>Decision inspector</CardTitle>
            </CardHeader>
            <CardContent>
              <RoutingTable entries={recent} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="expensive">
          <Card>
            <CardHeader>
              <CardTitle>Most expensive prompts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-zinc-800/60">
                {stats.mostExpensive.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm tabular-nums text-zinc-100">
                      {formatUsd(entry.costUsd)}
                    </span>
                    <TierBadge tier={entry.routedTier} size="sm" />
                    <span className="font-mono text-xs text-zinc-400">
                      {entry.project}
                    </span>
                    <span className="ml-auto text-xs text-zinc-500">
                      {timeAgo(entry.ts)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
