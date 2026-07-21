import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import {
  AUTO_MODEL,
  TIER_ORDER,
  estimateCostUsd,
  getDb,
  inspect,
  logRequest,
  normalizeInput,
  parseModelTier,
  upstreamModelFor,
} from "@prompt-inspector/core";
import type {
  ApiKind,
  ChatMessage,
  InspectInput,
  Inspection,
  RequestStatus,
  Tier,
} from "@prompt-inspector/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  demoChatCompletion,
  demoResponseObject,
  demoText,
  streamDemoChat,
  streamDemoResponse,
} from "./demo.js";
import { config } from "./env.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Maps a raw chat/responses payload onto the inspector's input shape. */
export function toInspectInput(
  api: ApiKind,
  body: Record<string, unknown>,
): InspectInput {
  const tools = Array.isArray(body.tools) ? body.tools : undefined;
  if (api === "chat") {
    return {
      messages: Array.isArray(body.messages)
        ? (body.messages as ChatMessage[])
        : [],
      tools,
      maxOutputTokens:
        pickNumber(body.max_completion_tokens) ?? pickNumber(body.max_tokens),
    };
  }
  const messages: ChatMessage[] = [];
  if (typeof body.instructions === "string" && body.instructions.trim() !== "") {
    messages.push({ role: "system", content: body.instructions });
  }
  let prompt: string | undefined;
  if (typeof body.input === "string") {
    prompt = body.input;
  } else if (Array.isArray(body.input)) {
    messages.push(...(body.input as ChatMessage[]));
  }
  return {
    prompt,
    messages,
    tools,
    maxOutputTokens: pickNumber(body.max_output_tokens),
  };
}

interface TokenCount {
  inputTokens: number;
  outputTokens: number;
}

function tokensFromUsage(api: ApiKind, usage: unknown): TokenCount | null {
  if (!isRecord(usage)) return null;
  const input = api === "chat" ? usage.prompt_tokens : usage.input_tokens;
  const output = api === "chat" ? usage.completion_tokens : usage.output_tokens;
  if (typeof input === "number" && typeof output === "number") {
    return { inputTokens: input, outputTokens: output };
  }
  return null;
}

/** Extracts JSON payloads from a captured SSE byte stream. */
function ssePayloads(text: string): unknown[] {
  const payloads: unknown[] = [];
  for (const block of text.replace(/\r\n/g, "\n").split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(data));
    } catch {
      // partial event at stream cut-off — ignore
    }
  }
  return payloads;
}

function usageFromStream(api: ApiKind, sseText: string): TokenCount | null {
  const events = ssePayloads(sseText);
  if (api === "chat") {
    // The usage chunk arrives last: empty choices plus a populated usage field.
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (isRecord(event)) {
        const tokens = tokensFromUsage("chat", event.usage);
        if (tokens) return tokens;
      }
    }
    return null;
  }
  for (const event of events) {
    if (isRecord(event) && event.type === "response.completed" && isRecord(event.response)) {
      return tokensFromUsage("responses", event.response.usage);
    }
  }
  return null;
}

interface RequestContext {
  api: ApiKind;
  project: string;
  requestedModel: string;
  routedTier: Tier;
  inspection: Inspection;
  upstreamModel: string;
  streaming: boolean;
  forced: boolean;
  hadTools: boolean;
  hadImages: boolean;
  start: number;
}

function persist(
  ctx: RequestContext,
  status: RequestStatus,
  tokens: TokenCount,
): void {
  const latencyMs = Math.round(performance.now() - ctx.start);
  const errored = status === "error";
  const costUsd = errored ? 0 : estimateCostUsd(ctx.routedTier, tokens.inputTokens, tokens.outputTokens);
  const solCostUsd = errored ? 0 : estimateCostUsd("sol", tokens.inputTokens, tokens.outputTokens);
  // Fire-and-forget: logging must never block the response path.
  void getDb()
    .then((db) =>
      logRequest(db, {
        id: randomUUID(),
        ts: Date.now(),
        project: ctx.project,
        api: ctx.api,
        requestedModel: ctx.requestedModel,
        routedTier: ctx.routedTier,
        recommendedTier: ctx.inspection.tier,
        upstreamModel: ctx.upstreamModel,
        taskType: ctx.inspection.taskType,
        reasons: ctx.inspection.reasons,
        confidence: ctx.inspection.confidence,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        costUsd,
        solCostUsd,
        savedUsd: Math.max(0, solCostUsd - costUsd),
        latencyMs,
        status,
        streaming: ctx.streaming,
        forced: ctx.forced,
        hadTools: ctx.hadTools,
        hadImages: ctx.hadImages,
      }),
    )
    .catch((err) => {
      console.error("[prompt-inspector] failed to persist request log:", err);
    });
}

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
} as const;

function sendDemo(ctx: RequestContext, reply: FastifyReply): void {
  const text = demoText(ctx.routedTier, ctx.inspection);
  const usage = ctx.inspection.estimates;
  const tokens = {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };

  if (!ctx.streaming) {
    const payload =
      ctx.api === "chat"
        ? demoChatCompletion(ctx.requestedModel, text, tokens)
        : demoResponseObject(ctx.requestedModel, text, tokens);
    persist(ctx, "demo", tokens);
    void reply.send(payload);
    return;
  }

  reply.hijack();
  reply.raw.writeHead(200, SSE_HEADERS);
  const write = (event: string | null, data: unknown): void => {
    if (event) reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
  };
  const done = (): void => {
    reply.raw.end();
    persist(ctx, "demo", tokens);
  };
  const run =
    ctx.api === "chat"
      ? streamDemoChat(write, ctx.requestedModel, text)
      : streamDemoResponse(write, ctx.requestedModel, text, tokens);
  run.then(done, (err) => {
    console.error("[prompt-inspector] demo stream failed:", err);
    reply.raw.destroy();
    persist(ctx, "error", { inputTokens: tokens.inputTokens, outputTokens: 0 });
  });
}

async function sendLive(
  ctx: RequestContext,
  reply: FastifyReply,
  body: Record<string, unknown>,
  authorization: string,
): Promise<void> {
  const path = ctx.api === "chat" ? "/v1/chat/completions" : "/v1/responses";
  const outgoing: Record<string, unknown> = { ...body, model: ctx.upstreamModel };
  if (ctx.streaming && ctx.api === "chat") {
    // Ask the upstream for a final usage chunk without clobbering user options.
    outgoing.stream_options = {
      ...(isRecord(body.stream_options) ? body.stream_options : {}),
      include_usage: true,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${config.openaiBaseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(outgoing),
    });
  } catch (err) {
    persist(ctx, "error", { inputTokens: ctx.inspection.estimates.inputTokens, outputTokens: 0 });
    void reply.code(502).send({
      error: {
        message: `Upstream request failed: ${err instanceof Error ? err.message : String(err)}`,
        type: "upstream_error",
      },
    });
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    persist(ctx, "error", { inputTokens: ctx.inspection.estimates.inputTokens, outputTokens: 0 });
    void reply
      .code(res.status)
      .header("content-type", res.headers.get("content-type") ?? "application/json")
      .send(text);
    return;
  }

  const estimates = ctx.inspection.estimates;
  const fallback: TokenCount = {
    inputTokens: estimates.inputTokens,
    outputTokens: estimates.outputTokens,
  };

  if (!ctx.streaming) {
    const text = await res.text();
    let tokens = fallback;
    try {
      tokens = tokensFromUsage(ctx.api, JSON.parse(text).usage) ?? fallback;
    } catch {
      // non-JSON success body — pass it through, keep estimate accounting
    }
    persist(ctx, "ok", tokens);
    void reply
      .code(res.status)
      .header("content-type", res.headers.get("content-type") ?? "application/json")
      .send(text);
    return;
  }

  reply.hijack();
  reply.raw.writeHead(200, SSE_HEADERS);
  const tee: Buffer[] = [];
  try {
    const stream = Readable.fromWeb(
      res.body as unknown as NodeReadableStream<Uint8Array>,
    );
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      tee.push(buf);
      reply.raw.write(buf);
    }
    reply.raw.end();
    const tokens = usageFromStream(ctx.api, Buffer.concat(tee).toString("utf8")) ?? fallback;
    persist(ctx, "ok", tokens);
  } catch (err) {
    console.error("[prompt-inspector] upstream stream broke:", err);
    reply.raw.destroy();
    persist(ctx, "error", { inputTokens: estimates.inputTokens, outputTokens: 0 });
  }
}

/**
 * The routing pipeline shared by both POST endpoints.
 *
 * 1. Resolve the requested model (default `gpt-5.6-auto`) and any forced
 *    tier — the `x-prompt-inspector-tier` header wins over a tier-pinned
 *    model name; an invalid header value is a 400.
 * 2. Normalize the payload and run `inspect()` unconditionally: even forced
 *    requests get a recommendation, which is what feeds waste detection.
 * 3. Route: forced tier or the classifier's pick. A request runs live only
 *    when an API key (caller-supplied or configured) AND an upstream model
 *    mapping for the routed tier both exist — otherwise it falls back to a
 *    synthesized demo response. This decision is per request and never fatal.
 * 4. Live: swap `model` for the upstream one and forward verbatim, streaming
 *    included (teed to capture final usage). Errors pass through untouched.
 * 5. Account: prefer upstream `usage`, fall back to the inspector's
 *    estimates; price the routed tier against a Sol baseline and persist the
 *    decision with `logRequest`.
 */
export async function routeRequest(
  api: ApiKind,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const start = performance.now();
  const body = isRecord(req.body) ? req.body : {};

  const tierHeader = req.headers["x-prompt-inspector-tier"];
  let headerTier: Tier | undefined;
  if (tierHeader !== undefined) {
    const value = Array.isArray(tierHeader) ? tierHeader[0] : tierHeader;
    if (!TIER_ORDER.includes(value as Tier)) {
      void reply.code(400).send({
        error: {
          message: `Invalid x-prompt-inspector-tier header: expected one of ${TIER_ORDER.join(", ")}.`,
          type: "invalid_request_error",
        },
      });
      return;
    }
    headerTier = value as Tier;
  }

  const requestedModel =
    typeof body.model === "string" && body.model.trim() !== "" ? body.model : AUTO_MODEL;
  const modelTier = parseModelTier(requestedModel);
  const forced = headerTier ?? (modelTier === "auto" ? undefined : modelTier);

  const inspectInput = toInspectInput(api, body);
  const inspection = inspect(inspectInput);
  const routedTier = forced ?? inspection.tier;
  const mapped = upstreamModelFor(routedTier);
  const authHeader = req.headers.authorization;
  // With the proxy gate enabled, the caller's Bearer token is the proxy key —
  // never forward it upstream; the proxy's own OpenAI key is the only source.
  const authorization = config.proxyApiKey
    ? config.openaiApiKey
      ? `Bearer ${config.openaiApiKey}`
      : undefined
    : typeof authHeader === "string" && authHeader !== ""
      ? authHeader
      : config.openaiApiKey
        ? `Bearer ${config.openaiApiKey}`
        : undefined;

  const projectHeader = req.headers["x-prompt-inspector-project"];
  const normalized = normalizeInput(inspectInput);
  const ctx: RequestContext = {
    api,
    project:
      typeof projectHeader === "string" && projectHeader.trim() !== ""
        ? projectHeader.trim()
        : "default",
    requestedModel,
    routedTier,
    inspection,
    upstreamModel: mapped ?? `demo-${routedTier}`,
    streaming: body.stream === true,
    forced: forced !== undefined,
    hadTools: normalized.tools > 0,
    hadImages: normalized.images > 0,
    start,
  };

  if (!mapped || !authorization) {
    sendDemo(ctx, reply);
    return;
  }
  await sendLive(ctx, reply, body, authorization);
}
