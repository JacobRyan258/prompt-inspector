/** Utility: report router vs human-label agreement on the benchmark dataset. */
import { BENCHMARKS } from "./benchmarks.js";
import { inspect } from "./classify.js";

function toolsFor(id: string): number {
  if (id.includes("weather")) return 1;
  if (id.includes("multi-step")) return 4;
  if (id.includes("orchestration")) return 5;
  return 0;
}

let ok = 0;
for (const b of BENCHMARKS) {
  const t = toolsFor(b.id);
  const r = inspect({ prompt: b.prompt, tools: Array.from({ length: t }, () => ({})) });
  if (r.tier === b.expectedTier) {
    ok++;
  } else {
    console.log(
      `${b.id}  router=${r.tier}  expected=${b.expectedTier}\n    ${r.reasons.join("; ")}`,
    );
  }
}
console.log(`accuracy ${ok}/${BENCHMARKS.length}`);
