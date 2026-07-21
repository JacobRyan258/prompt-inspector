import { randomUUID } from "node:crypto";
import { BENCHMARKS } from "@prompt-inspector/core/benchmarks";
import { inspect } from "@prompt-inspector/core/classify";
import { getDb, recordBenchmarkRun } from "@prompt-inspector/core/db";
import { NextResponse } from "next/server";
import { fakeTools, toolCountFor } from "@/lib/benchmarks";
import { runAllTiers } from "@/lib/run-tiers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const itemId =
    typeof body === "object" && body !== null && "itemId" in body
      ? (body as { itemId: unknown }).itemId
      : undefined;

  const item = BENCHMARKS.find((b) => b.id === itemId);
  if (!item) {
    return NextResponse.json(
      { error: "Unknown benchmark itemId." },
      { status: 404 },
    );
  }

  const tools = fakeTools(toolCountFor(item.id));
  const inspection = inspect({ prompt: item.prompt, tools });
  const runs = await runAllTiers(item.prompt, inspection, tools);
  const mode = runs.every((r) => !r.demo) ? "live" : "demo";

  const db = getDb();
  recordBenchmarkRun(
    db,
    {
      id: randomUUID(),
      ts: Date.now(),
      itemId: item.id,
      category: item.category,
      mode,
    },
    runs.map((r) => ({
      tier: r.tier,
      latencyMs: r.latencyMs,
      costUsd: r.costUsd,
      outputPreview: r.output.slice(0, 240),
      quality: null,
      status: r.demo ? "demo" : "ok",
    })),
  );

  return NextResponse.json({ mode, inspection, results: runs });
}
