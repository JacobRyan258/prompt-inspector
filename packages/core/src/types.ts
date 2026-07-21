export type Tier = "luna" | "terra" | "sol";

export type ReasoningLevel = "minimal" | "low" | "medium" | "high";

export type TaskType =
  | "classification"
  | "extraction"
  | "summarization"
  | "translation"
  | "writing"
  | "coding"
  | "architecture"
  | "math"
  | "reasoning"
  | "conversation"
  | "agentic"
  | "general";

export interface ChatMessage {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

/** What the inspector accepts: a raw prompt string, or an OpenAI-style payload. */
export interface InspectInput {
  prompt?: string;
  messages?: ChatMessage[];
  tools?: unknown[];
  maxOutputTokens?: number;
}

export interface NormalizedInput {
  /** All visible text, concatenated. */
  text: string;
  images: number;
  tools: number;
  messages: number;
  maxOutputTokens?: number;
}

export interface TierEstimate {
  tier: Tier;
  costUsd: number;
  latencyMs: number;
}

export interface Inspection {
  tier: Tier;
  reasoning: ReasoningLevel;
  /** 0..1 — how far the score sat from the nearest tier boundary. */
  confidence: number;
  taskType: TaskType;
  /** Human-readable explanation, e.g. "under 400 tokens", "no coding". */
  reasons: string[];
  estimates: {
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    costUsd: number;
  };
  /** Cost/latency for every tier, cheapest first. */
  comparison: TierEstimate[];
  /** How much more Sol costs than the recommendation: (sol - chosen) / chosen. */
  solPremiumPct: number;
  /** How much of the Sol bill you avoid: (sol - chosen) / sol. */
  savingsVsSolPct: number;
}

export interface Optimization {
  id: string;
  title: string;
  detail: string;
  /** Projected cost reduction vs. the current recommendation, 0..100. */
  estimatedSavingsPct: number;
  projectedTier: Tier;
  /** The rewritten prompt, when the suggestion is a mechanical transform. */
  rewrite?: string;
}

export interface BenchmarkItem {
  id: string;
  category:
    | "coding"
    | "architecture"
    | "extraction"
    | "summarization"
    | "translation"
    | "reasoning"
    | "math"
    | "long-context"
    | "tool-calling"
    | "writing";
  title: string;
  prompt: string;
  expectedTier: Tier;
}

export type RequestStatus = "ok" | "error" | "demo";
export type ApiKind = "chat" | "responses";

export interface RequestLogEntry {
  id: string;
  ts: number;
  project: string;
  api: ApiKind;
  requestedModel: string;
  routedTier: Tier;
  recommendedTier: Tier;
  upstreamModel: string;
  taskType: TaskType;
  reasons: string[];
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  solCostUsd: number;
  savedUsd: number;
  latencyMs: number;
  status: RequestStatus;
  streaming: boolean;
  forced: boolean;
  hadTools: boolean;
  hadImages: boolean;
}

export interface DashboardStats {
  totals: {
    requests: number;
    spendUsd: number;
    solBaselineUsd: number;
    savedUsd: number;
    savingsPct: number;
    avgLatencyMs: number;
  };
  tierDistribution: { tier: Tier; requests: number; costUsd: number }[];
  daily: { day: string; requests: number; costUsd: number; savedUsd: number }[];
  projects: { project: string; requests: number; costUsd: number; savedUsd: number }[];
  waste: {
    solRequests: number;
    wastedOnSolUsd: number;
    projectedMonthlyWasteUsd: number;
    headline: string | null;
  };
  mostExpensive: RequestLogEntry[];
  demo: boolean;
}
