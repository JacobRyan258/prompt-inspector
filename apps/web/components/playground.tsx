"use client";

import { BENCHMARKS } from "@prompt-inspector/core/benchmarks";
import type { Inspection, Optimization } from "@prompt-inspector/core/types";
import { SearchCode } from "lucide-react";
import { useRef, useState } from "react";
import { InspectionResult } from "@/components/inspection-result";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLE_IDS = ["extract-emails", "coding-debounce", "arch-rate-limiter"];
const EXAMPLES = EXAMPLE_IDS.map((id) => {
  const item = BENCHMARKS.find((b) => b.id === id);
  return item ? { id: item.id, title: item.title, prompt: item.prompt } : null;
}).filter((x): x is NonNullable<typeof x> => x !== null);

interface InspectResponse {
  inspection: Inspection;
  optimizations: Optimization[];
}

const PLACEHOLDER =
  "Paste a prompt here — e.g. “Summarize this support ticket in one sentence for a triage dashboard: 'Since the 2pm deploy our whole team gets stuck in an SSO redirect loop. Password login works. We use Okta. This is blocking all work.'”";

export function Playground() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<InspectResponse | null>(null);
  const [runId, setRunId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function runInspection() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as InspectResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setResult(data);
      setRunId((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inspection failed.");
    } finally {
      setLoading(false);
    }
  }

  function usePrompt(text: string) {
    setPrompt(text);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <div className="flex flex-col gap-4">
          <Textarea
            ref={textareaRef}
            rows={8}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={PLACEHOLDER}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runInspection();
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">Try an example:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => usePrompt(ex.prompt)}
                className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
              >
                {ex.title}
              </button>
            ))}
            <div className="ml-auto">
              <Button
                onClick={runInspection}
                disabled={!prompt.trim() || loading}
                size="lg"
              >
                <SearchCode className="size-4" />
                {loading ? "Inspecting…" : "Inspect"}
              </Button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </Card>

      {result && (
        <div key={runId} className="animate-fade-up">
          <InspectionResult
            inspection={result.inspection}
            optimizations={result.optimizations}
            onUsePrompt={usePrompt}
          />
        </div>
      )}
    </div>
  );
}
