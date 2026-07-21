import { TIERS } from "@prompt-inspector/core/pricing";
import type { Tier } from "@prompt-inspector/core/types";
import { TIER_DOT_CLASS, TIER_TEXT_CLASS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The product's atom: a pill with the tier color dot + label.
 * Reused across the playground, dashboard, challenge and benchmarks.
 */
export function TierBadge({
  tier,
  size = "md",
  className,
}: {
  tier: Tier;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const label = TIERS[tier].label;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 font-medium",
        size === "sm" && "px-2 py-0.5 text-[11px]",
        size === "md" && "px-2.5 py-1 text-xs",
        size === "lg" && "px-3.5 py-1.5 text-sm",
        className,
      )}
    >
      <span
        className={cn(
          "rounded-full",
          size === "lg" ? "size-2" : "size-1.5",
          TIER_DOT_CLASS[tier],
        )}
      />
      <span className={TIER_TEXT_CLASS[tier]}>{label}</span>
    </span>
  );
}
