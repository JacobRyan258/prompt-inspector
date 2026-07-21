import type { Tier } from "@prompt-inspector/core/types";

export const SITE_NAME = "Prompt Inspector";
export const SITE_URL = "https://promptinspector.local";
export const GITHUB_URL = "https://github.com/JacobRyan258/prompt-inspector";

/** Tier accent colors — keep in sync with globals.css @theme tokens. */
export const TIER_COLORS: Record<Tier, string> = {
  luna: "#38bdf8", // sky-400
  terra: "#a78bfa", // violet-400
  sol: "#fbbf24", // amber-400
};

export const TIER_TEXT_CLASS: Record<Tier, string> = {
  luna: "text-sky-400",
  terra: "text-violet-400",
  sol: "text-amber-400",
};

export const TIER_DOT_CLASS: Record<Tier, string> = {
  luna: "bg-sky-400",
  terra: "bg-violet-400",
  sol: "bg-amber-400",
};

export const TIER_BORDER_CLASS: Record<Tier, string> = {
  luna: "border-sky-400/40",
  terra: "border-violet-400/40",
  sol: "border-amber-400/40",
};
