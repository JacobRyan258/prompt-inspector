import { inspect } from "@prompt-inspector/core/classify";
import { NextResponse } from "next/server";
import { runAllTiers } from "@/lib/run-tiers";

const MAX_PROMPT_CHARS = 200_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt =
    typeof body === "object" && body !== null && "prompt" in body
      ? (body as { prompt: unknown }).prompt
      : undefined;

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json(
      { error: "Body must include a non-empty \"prompt\" string." },
      { status: 400 },
    );
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json(
      { error: `Prompt is too long (max ${MAX_PROMPT_CHARS.toLocaleString()} characters).` },
      { status: 400 },
    );
  }

  const inspection = inspect({ prompt });
  const results = await runAllTiers(prompt, inspection);

  return NextResponse.json({ inspection, results });
}
