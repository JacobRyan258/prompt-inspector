import { inspect } from "./classify.js";
import type { Inspection, InspectInput, Optimization } from "./types.js";

/**
 * The Prompt Optimizer. Each rule is a mechanical transform; the projected
 * savings are honest because we actually apply the transform and re-run the
 * inspector on the rewritten prompt.
 */

interface Rule {
  id: string;
  title: string;
  detail: string;
  /** Returns the rewritten text, or null when the rule does not apply. */
  apply: (text: string) => string | null;
}

const DEEP_THINK_PHRASES =
  /\s*(let's|lets)?\s*think (about this )?(step by step|carefully|deeply|hard)[.,!]?|\s*in (great|extreme|meticulous) detail[.,!]?|\s*be (very |extremely )?(thorough|comprehensive|exhaustive)[.,!]?|\s*leave no stone unturned[.,!]?/gi;

const FILLER_PHRASES =
  /\s*(please\s+)?(could|would|can) you (please\s+)?(kindly\s+)?/gi;

const POLITE_OPENERS =
  /^\s*(hi|hello|hey|dear)[^.\n]*[.,!]?\s*(i hope (this|you)[^.\n]*[.,!]?)?\s*/i;

const RULES: Rule[] = [
  {
    id: "trim-few-shot",
    title: "Trim the few-shot examples",
    detail:
      "Three or more example blocks push this prompt up a tier. One or two good examples usually preserve quality — the rest is expensive redundancy.",
    apply: (text) => {
      const blocks = text.split(/(?=\bexample\s*\d*\s*[:\-)])/gi);
      if (blocks.length < 4) return null; // preamble + 3 examples
      const kept = [blocks[0], ...blocks.slice(1, 3)];
      return kept.join("").trim();
    },
  },
  {
    id: "drop-deep-think",
    title: "Drop the deep-thinking instruction",
    detail:
      '"Think step by step" and "be thorough" are tier-raisers. On a well-scoped task they mostly buy verbosity, not accuracy.',
    apply: (text) => {
      if (!DEEP_THINK_PHRASES.test(text)) return null;
      DEEP_THINK_PHRASES.lastIndex = 0;
      const out = text
        .replace(DEEP_THINK_PHRASES, "")
        .replace(/\s{2,}/g, " ")
        .replace(/^\s*(?:(?:and|so|then|please)\s*)?[:,]\s*/i, "")
        .trim();
      return out.length >= 20 && out !== text.trim() ? out : null;
    },
  },
  {
    id: "add-output-cap",
    title: "Cap the output length",
    detail:
      "No length limit was detected. An explicit cap cuts output tokens — the most expensive kind — and rarely hurts the answer.",
    apply: (text) => {
      if (/\b\d{2,5}\s*(words?|pages?)\b/i.test(text)) return null;
      if (/under\s+\d+\s+words|in\s+\d+\s+sentences?/i.test(text)) return null;
      return `${text.trim()}\n\nKeep the answer under 150 words.`;
    },
  },
  {
    id: "dedupe-context",
    title: "Remove duplicated context",
    detail:
      "This prompt repeats itself. You pay for every duplicated sentence on every single request.",
    apply: (text) => {
      const sentences = text.match(/[^.!?\n]+[.!?]+/g);
      if (!sentences || sentences.length < 4) return null;
      const seen = new Set<string>();
      let dupes = 0;
      const kept = sentences.filter((s) => {
        const key = s.trim().toLowerCase();
        if (key.length < 15) return true;
        if (seen.has(key)) {
          dupes += 1;
          return false;
        }
        seen.add(key);
        return true;
      });
      if (dupes === 0) return null;
      return kept.join(" ").trim();
    },
  },
  {
    id: "strip-filler",
    title: "Strip the pleasantries",
    detail:
      '"Could you please kindly" costs tokens on every call and moves quality by zero. Models respond to instructions, not etiquette.',
    apply: (text) => {
      let out = text.replace(FILLER_PHRASES, " ").replace(POLITE_OPENERS, "");
      out = out.replace(/\s{2,}/g, " ").trim();
      return out !== text.trim() && out.length >= 10 ? out : null;
    },
  },
];

function projectedSavings(
  current: Inspection,
  rewritten: string,
  original: InspectInput,
): { savingsPct: number; tier: Inspection["tier"] } {
  const projection = inspect({ ...original, prompt: rewritten, messages: undefined });
  if (projection.estimates.costUsd >= current.estimates.costUsd) {
    return { savingsPct: 0, tier: projection.tier };
  }
  return {
    savingsPct: Math.round(
      ((current.estimates.costUsd - projection.estimates.costUsd) /
        current.estimates.costUsd) *
        100,
    ),
    tier: projection.tier,
  };
}

export function optimizePrompt(
  input: InspectInput,
  current?: Inspection,
): Optimization[] {
  const inspection = current ?? inspect(input);
  const text = inspection && input.prompt !== undefined ? input.prompt : undefined;

  const suggestions: Optimization[] = [];

  if (typeof text === "string" && text.trim().length > 0) {
    for (const rule of RULES) {
      const rewritten = rule.apply(text);
      if (rewritten === null) continue;
      const { savingsPct, tier } = projectedSavings(inspection, rewritten, input);
      if (savingsPct < 8 && tier === inspection.tier) continue;
      suggestions.push({
        id: rule.id,
        title: rule.title,
        detail: rule.detail,
        estimatedSavingsPct: savingsPct,
        projectedTier: tier,
        rewrite: rewritten,
      });
    }
  }

  // Split advice is structural — no mechanical rewrite, honest projection:
  // one part of a multi-part request almost always routes cheaper.
  if (
    inspection.reasons.some((r) => r.startsWith("multi-part request")) &&
    inspection.tier !== "luna"
  ) {
    suggestions.push({
      id: "split-tasks",
      title: "Split this into separate requests",
      detail:
        "Multi-part prompts route by their hardest part. Send the simple parts separately and they ride a cheaper tier — you stop paying Sol prices for Luna work.",
      estimatedSavingsPct: Math.max(15, Math.round(inspection.savingsVsSolPct * 0.6)),
      projectedTier: inspection.tier === "sol" ? "terra" : "luna",
    });
  }

  return suggestions
    .sort((a, b) => b.estimatedSavingsPct - a.estimatedSavingsPct)
    .slice(0, 4);
}
