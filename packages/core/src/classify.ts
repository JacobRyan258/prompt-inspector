import {
  TIERS,
  TIER_ORDER,
  estimateCostUsd,
  estimateLatencyMs,
} from "./pricing.js";
import { estimateTokens, normalizeInput, structuralTokens } from "./tokens.js";
import type {
  Inspection,
  InspectInput,
  NormalizedInput,
  ReasoningLevel,
  TaskType,
  Tier,
  TierEstimate,
} from "./types.js";

/**
 * The routing engine. Deterministic, local, free — and therefore honest.
 * Every point added to the score produces a human-readable reason, which is
 * what powers the Decision Inspector.
 *
 * Score bands: <= 1 → Luna, 2–4 → Terra, >= 5 → Sol.
 */

const CODE_RE =
  /```|function\s+\w+\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|=>|\bimport\s+[\w{]|\bfrom\s+['"]|class\s+\w+|def\s+\w+\s*\(|console\.log|print\s*\(|stack\s*trace|traceback|segmentation fault|null.?pointer|TypeError|SyntaxError|SELECT\s+.+\s+FROM|<\w+[^>]*>.*<\/\w+>/is;

const TASK_PATTERNS: [TaskType, RegExp][] = [
  [
    "translation",
    /\btranslate\b|\btranslation\b|into\s+(spanish|french|german|italian|portuguese|japanese|chinese|korean|arabic|hindi|russian|dutch|swedish|polish|turkish|vietnamese|thai)\b/i,
  ],
  [
    "extraction",
    /\bextract\s+(the\s+|all\s+|each\s+|every\s+)?[\w\s]{0,24}?(names?|titles?|compan\w+|phones?|emails?|e-mails?|prices?|urls?|links?|amounts?|dates?|times?|addresses?|keywords?|entities|fields?|values?|items?|data|metrics|numbers?|totals?|quantities)\b|\bpull out\b|\blist all\b|\bfind all\b|\bparse\b|\bget the (names?|dates?|emails?|prices?|urls?|amounts?)\b|\bto json\b|\bas json\b|\bfrom this (text|document|article|email|page|invoice|receipt)\b/i,
  ],
  [
    "classification",
    /\bclassify\b|\bcategori[sz]e\b|\blabel\b|\bsentiment\b|\bis this (spam|positive|negative|toxic|safe|a bug)\b|\bdetermine (if|whether)\b|\byes or no\b|\btrue or false\b|\btone of\b|\bintent of\b/i,
  ],
  [
    "summarization",
    /\bsummari[sz]e\b|\bsummary\b|\btl;?dr\b|\bkey points\b|\bbrief overview\b|\bmain ideas\b|\brecap\b/i,
  ],
  [
    "architecture",
    /\barchitect\b|\bsystem design\b|\bdesign a (system|platform|scalable|distributed)\b|\bmicroservices\b|\bhigh.?availability\b|\bhow would you design\b|\bmigration plan\b/i,
  ],
  [
    "math",
    /\bcalculate\b|\bcompute\b|\bsolve\b|\bintegral\b|\bderivative\b|\bequation\b|\bprobability\b|\balgebra\b|\btheorem\b|\blogarithm\b|\bstandard deviation\b|\bmonth over month\b|\byear over year\b|\bcompound(ing)?\b|\bgrowth rate\b|\binterest rate\b|\bamorti[sz]|\d+\s[\+\-\*\/×÷^x]\s\d+|\d+\s*[+×x*^÷]\s*\d+/i,
  ],
  [
    "coding",
    /\bimplement\b|\brefactor\b|\bdebug\b|\bfix (this|the|my|it)\b|\bwrite a (function|script|program|api|component|endpoint|query|hook)\b|\bregex\b|\bsql query\b|\btypescript\b|\bjavascript\b|\bpython\b|\bgolang\b|\brust\b|\breact\b|\bunit tests?\b|\bmigrat\w+ (this|the|from) (code|callbacks?)\b|\bhook\b/i,
  ],
  [
    "reasoning",
    /\bstep by step\b|\bthink (carefully|deeply|through)\b|\blogic (puzzle|grid)\b|\bdeduction\b|\bdeduce\b|\briddle\b|\bwhat would happen if\b|\bevaluate the argument\b|\bpros and cons\b|\bwhich (option|approach) is better\b/i,
  ],
  [
    "writing",
    /\bwrite (an?|me an?|me)\s+(email|blog|post|essay|article|story|poem|cover letter|linkedin|tweet|thread|press release|newsletter|changelog|launch post|slack (update|message)|release notes)\b|\brewrite\b|\bproofread\b|\bmarketing copy\b|\bad copy\b|\btagline\b|\bproduct description\b/i,
  ],
  [
    "conversation",
    /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening))\b|\bwhat is\b|\bwho is\b|\bdefine\b|\bexplain (what|the term)\b/i,
  ],
];

const DEEP_THINK_RE =
  /\bstep by step\b|\bthink (carefully|deeply|hard|through)\b|\bin (great|extreme|meticulous) detail\b|\bthorough(ly)?\b|\bcomprehensive\b|\bexhaustive\b|\bleave no stone unturned\b/i;

const LONG_FORM_RE =
  /\b(\d{3,5})[\s-]*(words?|pages?)\b|\bfull(ly)? (production|complete|detailed)\b|\bcomplete (implementation|solution|guide)\b|\bdetailed (report|analysis|breakdown)\b|\bin-?depth\b/i;

const HARD_DOMAIN_RE =
  /\btrade-?offs?\b|\bdistributed systems?\b|\bfailover\b|\bconsistency model\b|\bexactly-once\b|\bsecond-?order effects?\b|\bbyzantine\b|\bdual-?write\b|\bauthoritative during\b/i;

const CORRECTNESS_RE =
  /\bfully typed\b|\btype-?safe\b|\bgenerics\b|\bedge cases?\b|\bhandle (all )?errors?\b|\berror handling\b|\bclean ?up\b|\bproduction-?ready\b|\bunit tests?\b|\baccessib|\ba11y\b|\brigor(ous|ously)\b/i;

const STYLE_RE = /\b(tone|voice|style)\s*:/i;

const RIGOR_RE = /\bprove\b|\bformally\b|\brigor(ous|ously)\b/i;

const TASK_BASE_POINTS: Record<TaskType, number> = {
  classification: -1,
  extraction: -1,
  translation: -1,
  conversation: -1,
  summarization: 0,
  writing: 0,
  general: 0,
  reasoning: 1,
  agentic: 1,
  coding: 1,
  math: 2,
  architecture: 4,
};

const TASK_OUTPUT_TOKENS: Record<TaskType, number> = {
  classification: 60,
  extraction: 250,
  conversation: 220,
  translation: 0, // derived from input length instead
  summarization: 350,
  general: 400,
  math: 600,
  writing: 800,
  reasoning: 800,
  agentic: 700,
  coding: 900,
  architecture: 1500,
};

const CHEAP_TASKS: ReadonlySet<TaskType> = new Set([
  "classification",
  "extraction",
  "translation",
  "conversation",
]);

interface Signal {
  points: number;
  reason?: string;
}

function detectTaskType(text: string, hasCode: boolean): TaskType {
  for (const [type, re] of TASK_PATTERNS) {
    if (re.test(text)) return type;
  }
  return hasCode ? "coding" : "general";
}

function countSubQuestions(text: string): number {
  const questionMarks = (text.match(/\?/g) ?? []).length;
  const numbered = (text.match(/^\s*(\d+[\.\)]|[a-z][\.\)])\s+/gim) ?? []).length;
  const bullets = (text.match(/^\s*[-*•]\s+/gim) ?? []).length;
  const inlineEnum = (text.match(/[(（][a-e][)）]/g) ?? []).length;
  return Math.max(questionMarks, Math.min(numbered + bullets, 8), Math.min(inlineEnum, 8));
}

function detectLongFormWords(text: string): number | null {
  const m = text.match(/\b(\d{3,5})[\s-]*(words?|pages?)\b/i);
  if (!m || !m[1]) return LONG_FORM_RE.test(text) ? 1200 : null;
  const amount = parseInt(m[1], 10);
  return /pages?/i.test(m[2] ?? "") ? amount * 500 : amount;
}

function estimateOutputTokens(
  taskType: TaskType,
  inputTokens: number,
  text: string,
  normalized: NormalizedInput,
): number {
  const demandedWords = detectLongFormWords(text);
  let estimate =
    taskType === "translation"
      ? Math.ceil(inputTokens * 1.1)
      : TASK_OUTPUT_TOKENS[taskType];
  if (demandedWords !== null) {
    estimate = Math.max(estimate, Math.ceil(demandedWords * 1.4));
  }
  if (normalized.maxOutputTokens && normalized.maxOutputTokens > 0) {
    estimate = Math.min(estimate, normalized.maxOutputTokens);
  }
  return Math.max(30, Math.min(estimate, 16000));
}

function scoreToTier(score: number): Tier {
  if (score <= 1) return "luna";
  if (score <= 4) return "terra";
  return "sol";
}

function tierIndex(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

function reasoningFor(
  tier: Tier,
  taskType: TaskType,
  deepThink: boolean,
): ReasoningLevel {
  if (tier === "luna") {
    return taskType === "classification" || taskType === "extraction"
      ? "minimal"
      : "low";
  }
  if (tier === "terra") {
    return deepThink || taskType === "math" || taskType === "coding"
      ? "medium"
      : "low";
  }
  return deepThink || taskType === "architecture" || taskType === "math"
    ? "high"
    : "medium";
}

function confidenceFor(score: number, floorApplied: boolean): number {
  // Distance from the nearest tier boundary (1.5 separates luna/terra,
  // 4.5 separates terra/sol).
  const distance = Math.min(Math.abs(score - 1.5), Math.abs(score - 4.5));
  let confidence = Math.min(0.97, 0.58 + distance * 0.16);
  if (floorApplied) confidence *= 0.9;
  return Math.round(confidence * 100) / 100;
}

export function inspect(input: InspectInput): Inspection {
  const normalized = normalizeInput(input);
  const text = normalized.text;
  const lower = text.toLowerCase();

  const signals: Signal[] = [];
  const hasCode = CODE_RE.test(text);
  const taskType = detectTaskType(text, hasCode);

  // --- Size -----------------------------------------------------------------
  const inputTokens = estimateTokens(text) + structuralTokens(normalized);
  if (inputTokens < 400) {
    signals.push({ points: 0, reason: "under 400 tokens" });
  } else if (inputTokens < 1500) {
    signals.push({ points: 1, reason: `moderate length (~${inputTokens.toLocaleString()} tokens)` });
  } else if (inputTokens < 6000) {
    signals.push({ points: 2, reason: `sizable context (~${inputTokens.toLocaleString()} tokens)` });
  } else {
    signals.push({ points: 3, reason: `long context (~${inputTokens.toLocaleString()} tokens)` });
  }

  // --- Task type ------------------------------------------------------------
  const taskPoints = TASK_BASE_POINTS[taskType];
  const taskReasons: Partial<Record<TaskType, string>> = {
    classification: "classification task",
    extraction: "extraction task",
    translation: "translation task",
    summarization: "summarization task",
    conversation: "simple Q&A",
    writing: "writing task",
    coding: "coding work",
    architecture: "architecture / system design",
    math: "math problem",
    reasoning: "multi-step reasoning",
    agentic: "agentic tool workflow",
  };
  signals.push({ points: taskPoints, reason: taskReasons[taskType] });

  // Code blocks raise the stakes on coding work.
  if (taskType === "coding" && hasCode) {
    signals.push({ points: 1, reason: "includes a code block" });
  }

  // --- Structure & demands ----------------------------------------------------
  const subQuestions = countSubQuestions(text);
  if (subQuestions >= 3) {
    signals.push({ points: 1, reason: `multi-part request (${subQuestions} sub-questions)` });
  }

  const deepThink = DEEP_THINK_RE.test(lower);
  if (deepThink) {
    signals.push({ points: 1, reason: "explicit deep-reasoning instruction" });
  }

  if (detectLongFormWords(lower) !== null) {
    signals.push({ points: 1, reason: "demands long-form output" });
  }

  if (HARD_DOMAIN_RE.test(lower)) {
    signals.push({ points: 1, reason: "high-stakes domain vocabulary" });
  }

  if (CORRECTNESS_RE.test(lower)) {
    signals.push({ points: 1, reason: "strict correctness requirements" });
  }

  if (STYLE_RE.test(lower)) {
    signals.push({ points: 1, reason: "explicit style constraints" });
  }

  if (RIGOR_RE.test(lower)) {
    // Proofs in a math context deserve real firepower.
    signals.push({
      points: taskType === "math" ? 2 : 1,
      reason: taskType === "math" ? "formal proof required" : "requires rigor",
    });
  }

  // --- Capabilities -------------------------------------------------------------
  if (normalized.tools > 0) {
    signals.push({
      points: normalized.tools >= 3 ? 2 : 1,
      reason: `tool calling (${normalized.tools} tool${normalized.tools > 1 ? "s" : ""})`,
    });
  }
  if (normalized.images > 0) {
    signals.push({
      points: 1,
      reason: `includes ${normalized.images} image${normalized.images > 1 ? "s" : ""}`,
    });
  }

  // --- Cheap-task nudge -----------------------------------------------------------
  let score = signals.reduce((sum, s) => sum + s.points, 0);
  if (
    CHEAP_TASKS.has(taskType) &&
    inputTokens < 800 &&
    normalized.tools === 0 &&
    normalized.images === 0 &&
    subQuestions < 3 &&
    !deepThink
  ) {
    score -= 1;
    signals.push({ points: 0, reason: "simple, well-scoped task" });
  }

  let tier = scoreToTier(score);

  // --- Capability floors ------------------------------------------------------------
  let floorApplied = false;
  if (normalized.images > 0 && tierIndex(tier) < tierIndex("terra")) {
    tier = "terra";
    floorApplied = true;
  }
  if (normalized.tools >= 3 && tierIndex(tier) < tierIndex("terra")) {
    tier = "terra";
    floorApplied = true;
  }
  if (floorApplied) {
    signals.push({ points: 0, reason: "capability floor: needs vision/tooling support" });
  }

  // --- Reasons: what fired, plus honest absences for cheap tiers -----------------------
  const fired = signals
    .filter((s) => s.reason)
    .map((s) => s.reason as string);
  const absences: string[] = [];
  if (tier === "luna") {
    if (!hasCode && taskType !== "coding") absences.push("no coding");
    if (!deepThink && taskPoints <= 0) absences.push("low reasoning requirement");
    if (normalized.images === 0 && normalized.tools === 0) absences.push("no images or tools");
  } else if (tier === "terra" && !hasCode && taskType !== "coding") {
    absences.push("no coding");
  }
  const reasons = [...fired, ...absences].slice(0, 6);

  // --- Estimates ----------------------------------------------------------------------
  const outputTokens = estimateOutputTokens(taskType, inputTokens, lower, normalized);
  const comparison: TierEstimate[] = TIER_ORDER.map((t) => ({
    tier: t,
    costUsd: estimateCostUsd(t, inputTokens, outputTokens),
    latencyMs: estimateLatencyMs(t, outputTokens),
  }));
  const chosen = comparison[tierIndex(tier)]!;
  const sol = comparison[2]!;
  const solPremiumPct =
    tier === "sol" || chosen.costUsd <= 0
      ? 0
      : Math.round(((sol.costUsd - chosen.costUsd) / chosen.costUsd) * 100);
  const savingsVsSolPct =
    tier === "sol" || sol.costUsd <= 0
      ? 0
      : Math.round(((sol.costUsd - chosen.costUsd) / sol.costUsd) * 100);

  return {
    tier,
    reasoning: reasoningFor(tier, taskType, deepThink),
    confidence: confidenceFor(score, floorApplied),
    taskType,
    reasons,
    estimates: {
      inputTokens,
      outputTokens,
      latencyMs: chosen.latencyMs,
      costUsd: chosen.costUsd,
    },
    comparison,
    solPremiumPct,
    savingsVsSolPct,
  };
}

/** Display helper shared by UIs: "You would spend 63% more using Sol." */
export function wasteLine(inspection: Inspection): string | null {
  if (inspection.tier === "sol" || inspection.solPremiumPct <= 0) return null;
  return `You would spend ${inspection.solPremiumPct}% more using ${TIERS.sol.label}.`;
}
