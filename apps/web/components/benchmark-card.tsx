"use client";

import type { Tier } from "@prompt-inspector/core/types";
import { Play } from "lucide-react";
import { useState } from "react";
import { TierBadge } from "@/components/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatLatency, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RunResult {
  tier: Tier;
  output: string;
  latencyMs: number;
  costUsd: number;
  demo: boolean;
}

interface RunResponse {
  mode: string;
  results: RunResult[];
  error?: string;
}

export function BenchmarkCard({
  itemId,
  title,
  expectedTier,
  predictedTier,
  preview,
}: {
  itemId: string;
  title: string;
  expectedTier: Tier;
  predictedTier: Tier;
  preview: string;
}) {
  const [data, setData] = useState<RunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const mismatch = expectedTier !== predictedTier;

  async function run() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/benchmarks/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const json = (await res.json()) as RunResponse;
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-zinc-100">{title}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">
            human
          </span>
          <TierBadge tier={expectedTier} size="sm" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">
            router
          </span>
          <span
            className={cn(
              "rounded-full",
              mismatch && "ring-2 ring-amber-400/60",
            )}
          >
            <TierBadge tier={predictedTier} size="sm" />
          </span>
        </div>
      </div>
      <pre className="line-clamp-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-500">
        {preview}
      </pre>

      {data ? (
        <div className="flex flex-col gap-1.5 border-t border-zinc-800/70 pt-3">
          {data.results.map((r) => (
            <div key={r.tier} className="flex items-center gap-2 text-xs">
              <TierBadge tier={r.tier} size="sm" />
              <span className="tabular-nums text-zinc-400">
                {formatLatency(r.latencyMs)}
              </span>
              <span className="tabular-nums text-zinc-300">
                {formatUsd(r.costUsd)}
              </span>
              <span className="line-clamp-2 flex-1 font-mono text-[11px] text-zinc-500">
                {r.output}
              </span>
            </div>
          ))}
          {data.mode === "demo" && (
            <span className="text-[10px] text-zinc-600">
              demo mode — start the proxy for live numbers
            </span>
          )}
        </div>
      ) : (
        <div className="mt-auto pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={run}
            disabled={loading}
          >
            <Play className="size-3" />
            {loading ? "Running…" : "Run"}
          </Button>
        </div>
      )}
    </Card>
  );
}
