import { randomUUID } from "node:crypto";
import { TIERS, estimateCostUsd } from "@prompt-inspector/core";
import type { Inspection, Tier } from "@prompt-inspector/core";

/**
 * Demo mode: deterministic, clearly-labeled completions synthesized locally.
 * Runs when the request can't go live (no API key, or no upstream model
 * mapped for the routed tier) — it must never error for missing config.
 */

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function demoText(tier: Tier, inspection: Inspection): string {
  const label = TIERS[tier].label;
  const { inputTokens, outputTokens } = inspection.estimates;
  const cost = estimateCostUsd(tier, inputTokens, outputTokens);
  const solCost = estimateCostUsd("sol", inputTokens, outputTokens);
  const reasons = inspection.reasons.slice(0, 2).join("; ");
  return (
    `[demo mode · routed to ${label}] This is a simulated response. ` +
    `Add OPENAI_API_KEY and INSPECTOR_MODEL_LUNA/TERRA/SOL to get real answers. ` +
    `Inspection: ${inspection.taskType}; ${reasons}. ` +
    `Est. cost on ${label}: $${cost.toFixed(6)} — Sol would have cost $${solCost.toFixed(6)}.`
  );
}

function splitForStream(text: string, targetPieces = 10): string[] {
  const words = text.split(" ");
  const per = Math.max(1, Math.ceil(words.length / targetPieces));
  const pieces: string[] = [];
  for (let i = 0; i < words.length; i += per) {
    pieces.push(words.slice(i, i + per).join(" ") + (i + per < words.length ? " " : ""));
  }
  return pieces;
}

export interface DemoUsage {
  inputTokens: number;
  outputTokens: number;
}

export function demoChatCompletion(
  requestedModel: string,
  text: string,
  usage: DemoUsage,
): Record<string, unknown> {
  return {
    id: `chatcmpl-demo-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: usage.inputTokens,
      completion_tokens: usage.outputTokens,
      total_tokens: usage.inputTokens + usage.outputTokens,
    },
  };
}

export function demoResponseObject(
  requestedModel: string,
  text: string,
  usage: DemoUsage,
  id = `resp-demo-${randomUUID()}`,
): Record<string, unknown> {
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: requestedModel,
    output: [
      {
        type: "message",
        id: `msg-demo-${randomUUID()}`,
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    output_text: text,
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.inputTokens + usage.outputTokens,
    },
  };
}

type SseWriter = (event: string | null, data: unknown) => void;

export async function streamDemoChat(
  write: SseWriter,
  requestedModel: string,
  text: string,
): Promise<void> {
  const id = `chatcmpl-demo-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (
    delta: Record<string, unknown>,
    finishReason: string | null,
  ): Record<string, unknown> => ({
    id,
    object: "chat.completion.chunk",
    created,
    model: requestedModel,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });

  write(null, chunk({ role: "assistant", content: "" }, null));
  for (const piece of splitForStream(text)) {
    await sleep(30);
    write(null, chunk({ content: piece }, null));
  }
  write(null, chunk({}, "stop"));
  write(null, "[DONE]");
}

export async function streamDemoResponse(
  write: SseWriter,
  requestedModel: string,
  text: string,
  usage: DemoUsage,
): Promise<void> {
  const id = `resp-demo-${randomUUID()}`;
  const itemId = `msg-demo-${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  write("response.created", {
    type: "response.created",
    response: {
      id,
      object: "response",
      created_at: created,
      status: "in_progress",
      model: requestedModel,
      output: [],
    },
  });
  for (const piece of splitForStream(text)) {
    await sleep(30);
    write("response.output_text.delta", {
      type: "response.output_text.delta",
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: piece,
    });
  }
  write("response.completed", {
    type: "response.completed",
    response: demoResponseObject(requestedModel, text, usage, id),
  });
}
