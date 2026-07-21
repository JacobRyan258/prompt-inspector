"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface DailyPoint {
  day: string;
  requests: number;
  costUsd: number;
  savedUsd: number;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 8,
  fontSize: 12,
} as const;

function shortDay(day: string): string {
  // "2026-07-21" → "07-21"
  return day.slice(5);
}

function shortUsd(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

export function DailyChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={shortUsd}
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(value, name) => [
              `$${Number(value).toFixed(2)}`,
              name === "savedUsd" ? "Saved" : "Spend",
            ]}
          />
          <Area
            type="monotone"
            dataKey="costUsd"
            name="costUsd"
            stroke="#d4d4d8"
            strokeWidth={1.5}
            fill="#d4d4d8"
            fillOpacity={0.08}
          />
          <Area
            type="monotone"
            dataKey="savedUsd"
            name="savedUsd"
            stroke="#34d399"
            strokeWidth={1.5}
            fill="#34d399"
            fillOpacity={0.12}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
