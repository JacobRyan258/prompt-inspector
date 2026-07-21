import {
  BarChart3,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Route,
  SearchCode,
  Sparkles,
  Swords,
  TrendingDown,
} from "lucide-react";
import type { ComponentType } from "react";
import { Playground } from "@/components/playground";
import { Card } from "@/components/ui/card";

const FEATURES: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}[] = [
  {
    icon: SearchCode,
    title: "Inspect a Prompt",
    body: "Paste any prompt, get a tier verdict with the reasoning to back it up — before you spend a cent.",
  },
  {
    icon: BarChart3,
    title: "Cost Comparison",
    body: "Luna, Terra and Sol priced side by side on every request, down to the tenth of a cent.",
  },
  {
    icon: Sparkles,
    title: "Prompt Optimizer",
    body: "Mechanical rewrites that drop your prompt a tier — savings verified by re-inspection, not vibes.",
  },
  {
    icon: Route,
    title: "API Auto Router",
    body: "An OpenAI-compatible proxy. Change one baseURL line and every request rides the cheapest sufficient tier.",
  },
  {
    icon: LayoutDashboard,
    title: "Spending Dashboard",
    body: "Every routed request logged with cost, savings and latency. Watch the Sol money come back.",
  },
  {
    icon: ListChecks,
    title: "Decision Inspector",
    body: "Each routing decision ships with human-readable reasons. No black box, no hand-waving.",
  },
  {
    icon: Swords,
    title: "Challenge the Router",
    body: "Run one prompt against all three tiers side by side and judge whether the cheap model keeps up.",
  },
  {
    icon: TrendingDown,
    title: "Waste Detection",
    body: "Flags traffic riding Sol that the classifier says belongs downstairs — priced per month, in dollars.",
  },
  {
    icon: FlaskConical,
    title: "Benchmark Runner",
    body: "30 labeled prompts across 10 categories. Prove the router agrees with humans before you trust it.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Start the proxy",
    body: "pnpm dev in apps/proxy — it listens on localhost:4000 and speaks the OpenAI API.",
  },
  {
    n: "02",
    title: "Change the baseURL",
    body: "The only line of your code that changes. Every SDK that speaks OpenAI already works.",
  },
  {
    n: "03",
    title: "Ask for gpt-5.6-auto",
    body: "The router inspects each request and picks the tier. Pin gpt-5.6-sol whenever you disagree.",
  },
];

const SDK_SNIPPET = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:4000/v1", // ← the only change
});

const res = await client.chat.completions.create({
  model: "gpt-5.6-auto", // Kimi picks the tier
  messages,
});`;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-24 py-16 sm:py-24">
      {/* Hero + playground */}
      <section className="flex flex-col gap-10">
        <div className="flex max-w-3xl flex-col gap-5">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
            Before you spend money asking GPT-5.6…
            <span className="mt-2 block text-zinc-500">
              let Kimi inspect your prompt first.
            </span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-zinc-400">
            Prompt Inspector automatically picks the cheapest GPT-5.6 tier that
            can nail your prompt — Luna for the small stuff, Terra for the
            workhorse jobs, Sol only when it&apos;s actually earned.
          </p>
        </div>
        <Playground />
      </section>

      {/* SDK */}
      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Point your SDK at it
          </h2>
          <p className="text-sm text-zinc-400">
            One-line migration. Your code already speaks OpenAI — the proxy
            speaks it back, just cheaper.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {STEPS.map((step) => (
              <div key={step.n} className="flex gap-4">
                <span className="font-mono text-xs text-zinc-600">
                  {step.n}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-zinc-100">
                    {step.title}
                  </span>
                  <span className="text-sm leading-relaxed text-zinc-400">
                    {step.body}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Card className="lg:col-span-3">
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-zinc-300">
              <code>{SDK_SNIPPET}</code>
            </pre>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
            Everything the bill was hiding
          </h2>
          <p className="text-sm text-zinc-400">
            Inspection, routing, and accounting — in one open-source box.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="flex flex-col gap-3 p-5">
              <feature.icon className="size-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-100">
                {feature.title}
              </span>
              <p className="text-sm leading-relaxed text-zinc-400">
                {feature.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/70 pt-8 pb-4">
        <p className="text-sm text-zinc-500">
          Built by a very large Chinese model with strong opinions about your
          OpenAI bill. Open source, MIT.
        </p>
      </footer>
    </div>
  );
}
