"use client";

import type { Tier } from "@prompt-inspector/core/types";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TierBadge } from "@/components/tier-badge";
import { TIER_COLORS } from "@/lib/constants";
import { formatUsd } from "@/lib/format";

export interface TierSlice {
  tier: Tier;
  requests: number;
  costUsd: number;
}

export function TierDonut({ data }: { data: TierSlice[] }) {
  const total = data.reduce((sum, d) => sum + d.requests, 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="requests"
              nameKey="tier"
              innerRadius={62}
              outerRadius={84}
              strokeWidth={2}
              stroke="#09090b"
              startAngle={90}
              endAngle={-270}
            >
              {data.map((slice) => (
                <Cell key={slice.tier} fill={TIER_COLORS[slice.tier]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `${Number(value).toLocaleString()} requests`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-zinc-100">
            {total.toLocaleString()}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">
            requests
          </span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4">
        {data.map((slice) => (
          <div key={slice.tier} className="flex items-center gap-1.5">
            <TierBadge tier={slice.tier} size="sm" />
            <span className="text-xs tabular-nums text-zinc-400">
              {formatUsd(slice.costUsd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
