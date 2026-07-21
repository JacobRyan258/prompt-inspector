"use client";

import { TIERS } from "@prompt-inspector/core/pricing";
import type { RequestLogEntry } from "@prompt-inspector/core/types";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { TierBadge } from "@/components/tier-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatLatency, formatTokens, formatUsd, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RoutingTable({ entries }: { entries: RequestLogEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>When</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Routed</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Saved</TableHead>
          <TableHead className="text-right">Latency</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const open = openId === entry.id;
          return (
            <RowGroup
              key={entry.id}
              entry={entry}
              open={open}
              onToggle={() => setOpenId(open ? null : entry.id)}
            />
          );
        })}
      </TableBody>
    </Table>
  );
}

function RowGroup({
  entry,
  open,
  onToggle,
}: {
  entry: RequestLogEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const confidencePct = Math.round(entry.confidence * 100);
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="whitespace-nowrap text-zinc-400">
          <span className="flex items-center gap-2">
            {entry.status === "error" && (
              <span
                className="size-1.5 rounded-full bg-red-400"
                title="Request failed"
              />
            )}
            {timeAgo(entry.ts)}
          </span>
        </TableCell>
        <TableCell className="font-mono text-xs">{entry.project}</TableCell>
        <TableCell className="font-mono text-xs text-zinc-400">
          {entry.requestedModel}
        </TableCell>
        <TableCell>
          <span className="flex items-center gap-1.5">
            <TierBadge tier={entry.routedTier} size="sm" />
            {entry.forced && <Badge variant="warning">forced</Badge>}
          </span>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {formatUsd(entry.costUsd)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-emerald-400">
          {entry.savedUsd > 0 ? formatUsd(entry.savedUsd) : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums text-zinc-400">
          {formatLatency(entry.latencyMs)}
        </TableCell>
        <TableCell>
          <ChevronDown
            className={cn(
              "size-3.5 text-zinc-500 transition-transform",
              open && "rotate-180",
            )}
          />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-zinc-950/50 hover:bg-zinc-950/50">
          <TableCell colSpan={8} className="px-6 py-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-300">
                  Why {TIERS[entry.routedTier].label}:
                </span>
                <Badge variant="muted">{entry.taskType}</Badge>
                <span>confidence {confidencePct}%</span>
                <span>
                  {formatTokens(entry.inputTokens)} in ·{" "}
                  {formatTokens(entry.outputTokens)} out
                </span>
                <span className="font-mono">
                  upstream {entry.upstreamModel}
                </span>
                {entry.streaming && <span>streamed</span>}
                {entry.hadTools && <span>tools</span>}
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {entry.reasons.map((reason) => (
                  <li
                    key={reason}
                    className="flex items-start gap-2 text-xs text-zinc-400"
                  >
                    <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
