import type { Tier } from "./types.js";

/**
 * The GPT-5.6 tier table — the single source of truth for product vocabulary
 * and pricing. These are the defaults Prompt Inspector ships with; treat them
 * as configuration, not gospel. If your provider changes prices, change them
 * here (or wire this table to env/remote config in your deployment).
 */
export interface TierSpec {
  id: Tier;
  label: string;
  /** Public model name accepted by the proxy, e.g. "gpt-5.6-luna". */
  model: string;
  tagline: string;
  /** USD per 1M input tokens. */
  inputPer1M: number;
  /** USD per 1M output tokens. */
  outputPer1M: number;
  /** Latency model: fixed overhead + per-output-token cost. */
  baseLatencyMs: number;
  msPer1KOutputTokens: number;
  /** Env var that maps this tier to a real upstream model. */
  upstreamEnv: string;
}

export const TIERS: Record<Tier, TierSpec> = {
  luna: {
    id: "luna",
    label: "Luna",
    model: "gpt-5.6-luna",
    tagline: "Fast and cheap. Classification, extraction, summaries, simple Q&A.",
    inputPer1M: 0.4,
    outputPer1M: 1.6,
    baseLatencyMs: 320,
    msPer1KOutputTokens: 180,
    upstreamEnv: "INSPECTOR_MODEL_LUNA",
  },
  terra: {
    id: "terra",
    label: "Terra",
    model: "gpt-5.6-terra",
    tagline: "The workhorse. Coding, writing, translation, solid reasoning.",
    inputPer1M: 2.5,
    outputPer1M: 10,
    baseLatencyMs: 650,
    msPer1KOutputTokens: 300,
    upstreamEnv: "INSPECTOR_MODEL_TERRA",
  },
  sol: {
    id: "sol",
    label: "Sol",
    model: "gpt-5.6-sol",
    tagline: "Flagship. Architecture, hard math, deep multi-step reasoning.",
    inputPer1M: 12,
    outputPer1M: 36,
    baseLatencyMs: 1200,
    msPer1KOutputTokens: 450,
    upstreamEnv: "INSPECTOR_MODEL_SOL",
  },
};

export const TIER_ORDER: Tier[] = ["luna", "terra", "sol"];

/** Model name that activates auto-routing. */
export const AUTO_MODEL = "gpt-5.6-auto";

export function estimateCostUsd(
  tier: Tier,
  inputTokens: number,
  outputTokens: number,
): number {
  const spec = TIERS[tier];
  return (
    (inputTokens / 1_000_000) * spec.inputPer1M +
    (outputTokens / 1_000_000) * spec.outputPer1M
  );
}

export function estimateLatencyMs(tier: Tier, outputTokens: number): number {
  const spec = TIERS[tier];
  return Math.round(spec.baseLatencyMs + (outputTokens / 1000) * spec.msPer1KOutputTokens);
}

/**
 * Maps a proxy-facing model name to a tier, or "auto" for the router.
 * Accepts "gpt-5.6-luna" etc., bare tier names, and undefined → auto.
 */
export function parseModelTier(model: string | undefined | null): Tier | "auto" {
  if (!model) return "auto";
  const m = model.toLowerCase().trim();
  if (m === "auto" || m === AUTO_MODEL || m === "gpt-5.6") return "auto";
  for (const tier of TIER_ORDER) {
    if (m === tier || m === TIERS[tier].model) return tier;
  }
  return "auto";
}

/**
 * Resolves the real upstream model for a tier. Returns undefined when no
 * mapping is configured — callers should treat that as demo mode.
 */
export function upstreamModelFor(
  tier: Tier,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env[TIERS[tier].upstreamEnv];
  return value && value.trim() !== "" ? value.trim() : undefined;
}
