import path from "node:path";
import { pathToFileURL } from "node:url";
import cors from "@fastify/cors";
import { AUTO_MODEL, TIERS, TIER_ORDER, upstreamModelFor } from "@prompt-inspector/core";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { config } from "./env.js";
import { routeRequest } from "./pipeline.js";

const MODELS = [AUTO_MODEL, ...TIER_ORDER.map((tier) => TIERS[tier].model)];

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err: { statusCode?: number; message: string }, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    void reply.code(status).send({
      error: { message: err.message, type: "invalid_request_error" },
    });
  });

  // Shared-secret gate: with PROXY_API_KEY set, /v1/* requires a matching
  // Bearer token. /health stays open so uptime checks and Caddy work.
  app.addHook("onRequest", async (req, reply) => {
    if (!config.proxyApiKey || !req.url.startsWith("/v1/")) return;
    if (req.headers.authorization !== `Bearer ${config.proxyApiKey}`) {
      await reply.code(401).send({
        error: {
          message: "Missing or invalid proxy API key.",
          type: "invalid_request_error",
        },
      });
    }
  });

  app.get("/health", () => ({
    ok: true,
    mode:
      config.openaiApiKey && TIER_ORDER.some((tier) => upstreamModelFor(tier))
        ? "live"
        : "demo",
  }));

  app.get("/v1/models", () => ({
    object: "list",
    data: MODELS.map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "prompt-inspector",
    })),
  }));

  app.post("/v1/chat/completions", (req, reply) => routeRequest("chat", req, reply));
  app.post("/v1/responses", (req, reply) => routeRequest("responses", req, reply));

  return app;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const app = await buildServer();
  await app.listen({ port: config.port, host: config.host });
  console.log(`[prompt-inspector] proxy listening on http://${config.host}:${config.port}/v1`);
}
