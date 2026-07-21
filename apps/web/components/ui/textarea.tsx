import { cn } from "@/lib/utils";
import type { Ref, TextareaHTMLAttributes } from "react";

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-3",
        "font-mono text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600",
        "focus:border-zinc-600 focus:outline-none",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
