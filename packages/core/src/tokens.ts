import type { ChatMessage, InspectInput, NormalizedInput } from "./types.js";

/**
 * Fast heuristic token estimate (~4 chars/token, slightly generous).
 * We never want inspection itself to cost tokens, so this stays local
 * and deterministic by design.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Pulls text and image counts out of one OpenAI-style message content field. */
function readContent(content: unknown, out: { text: string[]; images: number }): void {
  if (typeof content === "string") {
    out.text.push(content);
    return;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!isRecord(part)) continue;
      const type = typeof part.type === "string" ? part.type : "";
      if (type === "text" || type === "input_text" || type === "output_text") {
        if (typeof part.text === "string") out.text.push(part.text);
      } else if (
        type === "image_url" ||
        type === "input_image" ||
        type === "image"
      ) {
        out.images += 1;
      }
    }
    return;
  }
  if (isRecord(content) && typeof content.text === "string") {
    out.text.push(content.text);
  }
}

/**
 * Normalizes a raw prompt or an OpenAI chat/responses payload into plain
 * text plus multimodal/tool counts, so the classifier only ever deals
 * with one shape.
 */
export function normalizeInput(input: InspectInput): NormalizedInput {
  const text: string[] = [];
  let images = 0;
  let messages = 0;

  if (typeof input.prompt === "string" && input.prompt.trim() !== "") {
    text.push(input.prompt);
  }

  if (Array.isArray(input.messages)) {
    const acc = { text, images };
    for (const message of input.messages as ChatMessage[]) {
      messages += 1;
      readContent(message?.content, acc);
      // Responses API items sometimes nest content under "content" of typed parts.
      if (isRecord(message) && typeof message.content === "undefined") {
        for (const value of Object.values(message)) readContent(value, acc);
      }
    }
    images = acc.images;
  }

  const tools = Array.isArray(input.tools) ? input.tools.length : 0;
  return {
    text: text.filter(Boolean).join("\n"),
    images,
    tools,
    messages,
    maxOutputTokens: input.maxOutputTokens,
  };
}

/** Extra input tokens not present in the visible text. */
export function structuralTokens(normalized: NormalizedInput): number {
  return (
    normalized.messages * 4 +
    normalized.tools * 300 +
    normalized.images * 850
  );
}
