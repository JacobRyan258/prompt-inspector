/** Mirrors the core seed logic: representative tool counts per tool-calling item. */
export function toolCountFor(itemId: string): number {
  if (itemId.includes("weather")) return 1;
  if (itemId.includes("multi-step")) return 4;
  if (itemId.includes("orchestration")) return 5;
  return 0;
}

export function fakeTools(count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "function",
    function: {
      name: `tool_${i + 1}`,
      description: "Demo tool used by the benchmark runner.",
      parameters: { type: "object", properties: {} },
    },
  }));
}
