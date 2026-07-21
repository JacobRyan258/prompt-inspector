import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "default" | "outline" | "success" | "warning" | "muted";

const variants: Record<Variant, string> = {
  default: "bg-zinc-800 text-zinc-200 border-transparent",
  outline: "border-zinc-700 text-zinc-300",
  success: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  warning: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  muted: "bg-zinc-800/60 text-zinc-400 border-zinc-800",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium leading-4 whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
