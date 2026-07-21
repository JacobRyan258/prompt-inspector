import {
  TIERS,
  TIER_ORDER,
  estimateCostUsd,
} from "@prompt-inspector/core/pricing";
import type { Inspection, Tier } from "@prompt-inspector/core/types";
import { formatUsd } from "./format";

/**
 * Server-only: runs a prompt against every tier through the local proxy,
 * falling back to an honest demo simulation when the proxy is unreachable.
 * Shared by /api/challenge and /api/benchmarks/run.
 */

const PROXY_URL =
  process.env.PROMPT_INSPECTOR_PROXY_URL ?? "http://localhost:4000";

const TIMEOUT_MS = 6_000;

export interface TierRunResult {
  tier: Tier;
  output: string;
  latencyMs: number;
  costUsd: number;
  demo: boolean;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function readContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join("");
  }
  return "";
}

function demoOutput(tier: Tier, inspection: Inspection): string {
  const spec = TIERS[tier];
  const estimate = inspection.comparison.find((c) => c.tier === tier);
  const reasons = inspection.reasons.slice(0, 2).join(", ");
  return [
    `[demo · ${spec.label}] The proxy at ${PROXY_URL} is not running, so this is a simulated answer.`,
    ``,
    `Kimi's read: ${inspection.taskType} (${reasons}). ${spec.label} would field this for about ${formatUsd(
      estimate?.costUsd ?? inspection.estimates.costUsd,
    )} at ~${estimate?.latencyMs ?? inspection.estimates.latencyMs}ms.`,
    ``,
    `Start the proxy (apps/proxy) and this column becomes a real ${spec.model} response.`,
  ].join("\n");
}

async function runTier(
  prompt: string,
  tier: Tier,
  inspection: Inspection,
  tools?: unknown[],
): Promise<TierRunResult> {
  const estimate = inspection.comparison.find((c) => c.tier === tier);
  const started = Date.now();
  try {
    const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: TIERS[tier].model,
        messages: [{ role: "user", content: prompt }],
        ...(tools && tools.length > 0 ? { tools } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`proxy returned ${res.status}`);
    const data = (await res.json()) as ChatCompletionResponse;
    const output =
      readContent(data.choices?.[0]?.message?.content) || "(empty response)";
    const latencyMs = Date.now() - started;
    const costUsd =
      data.usage?.prompt_tokens != null && data.usage?.completion_tokens != null
        ? estimateCostUsd(
            tier,
            data.usage.prompt_tokens,
            data.usage.completion_tokens,
          )
        : (estimate?.costUsd ?? inspection.estimates.costUsd);
    return { tier, output, latencyMs, costUsd, demo: false };
  } catch {
    return {
      tier,
      output: demoOutput(tier, inspection),
      latencyMs: estimate?.latencyMs ?? inspection.estimates.latencyMs,
      costUsd: estimate?.costUsd ?? inspection.estimates.costUsd,
      demo: true,
    };
  }
}

export function runAllTiers(
  prompt: string,
  inspection: Inspection,
  tools?: unknown[],
): Promise<TierRunResult[]> {
  return Promise.all(
    TIER_ORDER.map((tier) => runTier(prompt, tier, inspection, tools)),
  );
}
