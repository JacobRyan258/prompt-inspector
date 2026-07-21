import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: "emerald";
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-5">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          accent === "emerald" ? "text-emerald-400" : "text-zinc-50",
        )}
      >
        {value}
      </span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </Card>
  );
}
