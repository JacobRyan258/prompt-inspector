"use client";

import { wasteLine } from "@prompt-inspector/core/classify";
import { TIERS, TIER_ORDER } from "@prompt-inspector/core/pricing";
import type { Inspection, Optimization } from "@prompt-inspector/core/types";
import {
  Check,
  ChevronDown,
  Download,
  Share2,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { TierBadge } from "@/components/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SITE_URL, TIER_COLORS } from "@/lib/constants";
import { formatLatency, formatPct, formatTokens, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
      {children}
    </h3>
  );
}

export function InspectionResult({
  inspection,
  optimizations,
  onUsePrompt,
}: {
  inspection: Inspection;
  optimizations: Optimization[];
  onUsePrompt?: (prompt: string) => void;
}) {
  const [openRewrite, setOpenRewrite] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const tier = inspection.tier;
  const label = TIERS[tier].label;
  const savings = inspection.savingsVsSolPct;
  const waste = wasteLine(inspection);
  const confidencePct = Math.round(inspection.confidence * 100);
  const maxCost = Math.max(...inspection.comparison.map((c) => c.costUsd));

  const shareText =
    savings > 0
      ? `Kimi says this only needs ${label}. I almost wasted ${savings}% on GPT-5.6. Prompt Inspector caught it.`
      : `Kimi audited my prompt: it genuinely needs Sol. Prompt Inspector confirms before I spend.`;
  const shareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText,
  )}&url=${encodeURIComponent(SITE_URL)}`;

  async function downloadCard() {
    if (downloading) return;
    setDownloading(true);
    try {
      const style =
        tier === "sol" ? "audited" : savings > 0 ? "almost-wasted" : "kimi-says";
      const res = await fetch(
        `/api/og?tier=${tier}&savings=${savings}&style=${style}`,
      );
      if (!res.ok) throw new Error(`card failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prompt-inspector-${tier}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-8 p-6">
      {/* Verdict */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <TierBadge tier={tier} size="lg" />
          <Badge variant="outline">reasoning: {inspection.reasoning}</Badge>
          <Badge variant="muted">{inspection.taskType}</Badge>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="text-xs text-zinc-500">confidence</span>
            <div className="h-1 w-28 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${confidencePct}%`,
                  backgroundColor: TIER_COLORS[tier],
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-zinc-300">
              {confidencePct}%
            </span>
          </div>
        </div>
        <p className="text-sm text-zinc-400">
          The router would send this to{" "}
          <span className="text-zinc-200">{TIERS[tier].model}</span>.{" "}
          {savings > 0 && (
            <span className="text-emerald-400">
              That avoids {formatPct(savings)} of the Sol bill.
            </span>
          )}
        </p>
      </div>

      {/* Why */}
      <div className="flex flex-col gap-3">
        <SectionTitle>{`Why ${label}`}</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2">
          {inspection.reasons.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-2 text-sm text-zinc-300"
            >
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Cost comparison */}
      <div className="flex flex-col gap-3">
        <SectionTitle>Cost comparison</SectionTitle>
        <div className="flex flex-col gap-2.5">
          {TIER_ORDER.map((t) => {
            const entry = inspection.comparison.find((c) => c.tier === t);
            if (!entry) return null;
            const chosen = t === tier;
            const width = maxCost > 0 ? (entry.costUsd / maxCost) * 100 : 0;
            return (
              <div key={t} className="flex items-center gap-3">
                <span className="w-12 text-xs text-zinc-400">
                  {TIERS[t].label}
                </span>
                <div className="relative h-7 flex-1">
                  <div
                    className="flex h-full items-center justify-end rounded-md pr-2"
                    style={{
                      width: `${Math.max(width, 6)}%`,
                      backgroundColor: `${TIER_COLORS[t]}${chosen ? "33" : "1a"}`,
                      boxShadow: chosen
                        ? `0 0 0 1px ${TIER_COLORS[t]}80, 0 0 24px ${TIER_COLORS[t]}26`
                        : undefined,
                    }}
                  >
                    <span
                      className={cn(
                        "text-[11px] tabular-nums",
                        chosen ? "text-zinc-100" : "text-zinc-400",
                      )}
                    >
                      {formatUsd(entry.costUsd)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {waste && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-sm text-amber-400">
            <TriangleAlert className="size-4 shrink-0" />
            {waste}
          </div>
        )}
      </div>

      {/* Estimates */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Est. latency", value: formatLatency(inspection.estimates.latencyMs) },
          { label: "Input tokens", value: formatTokens(inspection.estimates.inputTokens) },
          { label: "Output tokens", value: formatTokens(inspection.estimates.outputTokens) },
          { label: "Est. cost", value: formatUsd(inspection.estimates.costUsd) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2.5"
          >
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              {stat.label}
            </div>
            <div className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Optimizer */}
      {optimizations.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Zap className="size-3.5 text-emerald-400" />
            <SectionTitle>Make it cheaper</SectionTitle>
          </div>
          <div className="flex flex-col gap-2">
            {optimizations.map((opt) => {
              const open = openRewrite === opt.id;
              return (
                <div
                  key={opt.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100">
                      {opt.title}
                    </span>
                    <Badge variant="success">
                      −{formatPct(opt.estimatedSavingsPct)}
                    </Badge>
                    <span className="text-xs text-zinc-500">projects to</span>
                    <TierBadge tier={opt.projectedTier} size="sm" />
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-400">{opt.detail}</p>
                  {opt.rewrite && (
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenRewrite(open ? null : opt.id)}
                          className="flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                        >
                          <ChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              open && "rotate-180",
                            )}
                          />
                          {open ? "Hide rewrite" : "View rewrite"}
                        </button>
                        {onUsePrompt && (
                          <button
                            type="button"
                            onClick={() => onUsePrompt(opt.rewrite ?? "")}
                            className="text-xs text-emerald-400 transition-colors hover:text-emerald-300"
                          >
                            Use this prompt
                          </button>
                        )}
                      </div>
                      {open && (
                        <pre className="max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300">
                          {opt.rewrite}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Share */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/70 pt-5">
        <a href={shareHref} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            <Share2 className="size-3.5" />
            Share on X
          </Button>
        </a>
        <Button
          variant="secondary"
          size="sm"
          onClick={downloadCard}
          disabled={downloading}
        >
          <Download className="size-3.5" />
          {downloading ? "Rendering…" : "Download card"}
        </Button>
      </div>
    </Card>
  );
}
