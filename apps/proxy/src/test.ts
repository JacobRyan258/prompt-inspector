/**
 * Smoke test: boots the proxy on an ephemeral port and exercises the demo-mode
 * surface end to end. No framework — plain asserts, `ok`/`FAIL` per check,
 * exit 1 on any failure.
 *
 * Env is pinned BEFORE importing the server/core so the run is deterministic:
 * a throwaway SQLite file, and no API keys (forces demo mode even if a stray
 * .env exists — dotenv never overrides keys that are already set).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.PROMPT_INSPECTOR_DB = path.join(
  mkdtempSync(path.join(tmpdir(), "prompt-inspector-proxy-test-")),
  "test.db",
);
process.env.DATABASE_URL = "";
process.env.OPENAI_API_KEY = "";
process.env.INSPECTOR_MODEL_LUNA = "";
process.env.INSPECTOR_MODEL_TERRA = "";
process.env.INSPECTOR_MODEL_SOL = "";
process.env.PROXY_API_KEY = "test-proxy-key";

const { buildServer } = await import("./index.js");
const core = await import("@prompt-inspector/core");

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? "ok" : "FAIL"} — ${name}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) console.log("  ", detail);
  }
}

const app = await buildServer();
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address() as AddressInfo;
const base = `http://127.0.0.1:${port}`;

const post = (pathName: string, body: unknown): Promise<Response> =>
  fetch(`${base}${pathName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-proxy-key",
    },
    body: JSON.stringify(body),
  });

// undici types `res.json()` as unknown; the smoke test pokes at free-form JSON.
const asJson = async (res: Response): Promise<any> => (await res.json()) as any;

const classificationPrompt =
  "Classify this support ticket as billing, bug, or feature request: 'Please add dark mode to the dashboard.'";

try {
  // 0. Proxy gate — unauthenticated /v1/* is rejected, /health stays open.
  const noAuthRes = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-auto", messages: [] }),
  });
  check("request without proxy key returns 401", noAuthRes.status === 401, noAuthRes.status);

  const wrongKeyRes = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer wrong-key",
    },
    body: JSON.stringify({ model: "gpt-5.6-auto", messages: [] }),
  });
  check("request with wrong proxy key returns 401", wrongKeyRes.status === 401, wrongKeyRes.status);

  const healthRes = await fetch(`${base}/health`);
  check("GET /health stays open without a key", healthRes.status === 200, healthRes.status);

  // 1. Auto-routed chat completion (demo) — valid shape, logged, luna recommended.
  const chatRes = await post("/v1/chat/completions", {
    model: "gpt-5.6-auto",
    messages: [{ role: "user", content: classificationPrompt }],
    max_tokens: 50,
  });
  const chatBody = await asJson(chatRes);
  check("chat completion returns 200", chatRes.status === 200, chatRes.status);
  check(
    "chat completion has valid shape",
    chatBody.object === "chat.completion" &&
      typeof chatBody.id === "string" &&
      chatBody.id.startsWith("chatcmpl-demo-") &&
      typeof chatBody.choices?.[0]?.message?.content === "string" &&
      typeof chatBody.usage?.total_tokens === "number",
    chatBody,
  );

  const logged = await core.recentRequests(await core.getDb(), 10);
  const autoRow = logged.find((r) => r.requestedModel === "gpt-5.6-auto" && r.api === "chat");
  check(
    "auto request logged as demo with recommendedTier luna",
    autoRow?.status === "demo" && autoRow.recommendedTier === "luna",
    autoRow,
  );

  // 2. Streaming chat completion — terminates with data: [DONE].
  const streamRes = await post("/v1/chat/completions", {
    model: "gpt-5.6-auto",
    stream: true,
    messages: [{ role: "user", content: classificationPrompt }],
  });
  const streamText = await streamRes.text();
  check(
    "streaming chat emits SSE ending in data: [DONE]",
    streamRes.status === 200 &&
      (streamRes.headers.get("content-type") ?? "").includes("text/event-stream") &&
      streamText.includes("data: [DONE]"),
    streamText.slice(-200),
  );

  // 3. Forced tier — routed sol, still recommended luna.
  const forcedRes = await post("/v1/chat/completions", {
    model: "gpt-5.6-sol",
    messages: [{ role: "user", content: classificationPrompt }],
  });
  await forcedRes.json();
  const forcedRow = (await core.recentRequests(await core.getDb(), 10)).find(
    (r) => r.requestedModel === "gpt-5.6-sol",
  );
  check(
    "forced gpt-5.6-sol logged routedTier sol, recommendedTier luna",
    forcedRow?.routedTier === "sol" && forcedRow.recommendedTier === "luna",
    forcedRow,
  );

  // 4. Responses API with plain string input — valid response object.
  const respRes = await post("/v1/responses", {
    model: "gpt-5.6-auto",
    input: "What is the capital of France?",
  });
  const respBody = await asJson(respRes);
  check(
    "responses endpoint returns a valid response object",
    respRes.status === 200 &&
      respBody.object === "response" &&
      respBody.status === "completed" &&
      typeof respBody.output_text === "string" &&
      typeof respBody.usage?.input_tokens === "number" &&
      typeof respBody.usage?.output_tokens === "number",
    respBody,
  );

  // 5. Models list — the four proxy-facing model names.
  const modelsRes = await fetch(`${base}/v1/models`, {
    headers: { authorization: "Bearer test-proxy-key" },
  });
  const modelsBody = await asJson(modelsRes);
  const ids = (modelsBody.data ?? []).map((m: { id?: string }) => m.id);
  check(
    "GET /v1/models lists the 4 proxy models",
    modelsRes.status === 200 &&
      modelsBody.object === "list" &&
      ids.length === 4 &&
      ["gpt-5.6-auto", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"].every((id) =>
        ids.includes(id),
      ),
    modelsBody,
  );
} finally {
  await app.close();
}

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
