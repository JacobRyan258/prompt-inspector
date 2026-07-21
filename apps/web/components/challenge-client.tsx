"use client";

import { TIERS } from "@prompt-inspector/core/pricing";
import type { Inspection } from "@prompt-inspector/core/types";
import { Swords } from "lucide-react";
import { useState } from "react";
import { TierBadge } from "@/components/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatLatency, formatPct, formatUsd } from "@/lib/format";

interface TierResult {
  tier: "luna" | "terra" | "sol";
  output: string;
  latencyMs: number;
  costUsd: number;
  demo: boolean;
}

interface ChallengeResponse {
  inspection: Inspection;
  results: TierResult[];
  error?: string;
}

const PLACEHOLDER =
  "e.g. Extract every date from this text and convert to ISO 8601: 'The lease starts March 3rd, 2025, with a review on 9/15/2025…'";

export function ChallengeClient() {
  const [prompt, setPrompt] = useState("");
  const [data, setData] = useState<ChallengeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runChallenge() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = (await res.json()) as ChallengeResponse;
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Challenge failed.");
    } finally {
      setLoading(false);
    }
  }

  const sol = data?.results.find((r) => r.tier === "sol");
  const cheapest = data?.results.reduce((min, r) =>
    r.costUsd < min.costUsd ? r : min,
  );
  const multiple =
    sol && cheapest && cheapest.costUsd > 0
      ? Math.round(sol.costUsd / cheapest.costUsd)
      : null;
  const routerTier = data?.inspection.tier;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <Textarea
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={PLACEHOLDER}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Hits the local proxy when it&apos;s running; simulated otherwise.
          </span>
          <Button onClick={runChallenge} disabled={!prompt.trim() || loading}>
            <Swords className="size-4" />
            {loading ? "Running all tiers…" : "Run all tiers"}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </Card>

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {data.results.map((result) => (
              <Card
                key={result.tier}
                className="flex flex-col gap-3 p-5 animate-fade-up"
              >
                <div className="flex items-center gap-2">
                  <TierBadge tier={result.tier} />
                  {result.demo && <Badge variant="warning">demo</Badge>}
                  <span className="ml-auto text-xs tabular-nums text-zinc-500">
                    {formatLatency(result.latencyMs)}
                  </span>
                </div>
                <div className="text-lg font-semibold tabular-nums text-zinc-100">
                  {formatUsd(result.costUsd)}
                </div>
                <pre className="max-h-64 flex-1 overflow-auto rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300">
                  {result.output}
                </pre>
              </Card>
            ))}
          </div>

          {sol && cheapest && (
            <Card className="flex flex-col gap-2 border-zinc-700/60 p-6 animate-fade-up">
              <p className="text-lg font-medium tracking-tight text-zinc-100">
                Sol cost{" "}
                <span className="tabular-nums text-amber-400">
                  {multiple !== null && multiple > 1 ? `${multiple}×` : "about the same as"}
                </span>{" "}
                {multiple !== null && multiple > 1
                  ? `more than ${TIERS[cheapest.tier].label}.`
                  : `${TIERS[cheapest.tier].label}.`}
              </p>
              {routerTier && routerTier !== "sol" ? (
                <p className="text-sm text-zinc-400">
                  The router would have used{" "}
                  <span className="text-zinc-100">
                    {TIERS[routerTier].label}
                  </span>{" "}
                  — and saved{" "}
                  <span className="text-emerald-400">
                    {formatPct(data.inspection.savingsVsSolPct)}
                  </span>
                  . The expensive answer is right there; compare them yourself.
                </p>
              ) : (
                <p className="text-sm text-zinc-400">
                  The router agrees this one earns the flagship. Some prompts
                  really are Sol-shaped.
                </p>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
