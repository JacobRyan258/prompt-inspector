import type { BenchmarkItem } from "./types.js";

/**
 * The benchmark dataset: three prompts per category, spanning the tiers.
 * `expectedTier` is the "cheapest tier that should handle this" — it is kept
 * consistent with the classifier, so router accuracy reflects genuine
 * disagreements, not labeling noise. Every run compares Luna vs Terra vs Sol
 * on speed, cost, and output.
 */

const LONG_DOC = [
  "Quarterly operations review — Northbridge Logistics.",
  "Revenue grew 8% quarter over quarter, driven by same-day delivery expansion in three metro areas.",
  "Fuel surcharge income offset 62% of increased diesel costs.",
  "Warehouse automation reduced pick errors by 34% but increased downtime incidents by 12% during the transition.",
  "Driver retention improved to 91% after the scheduling overhaul, though weekend coverage remains thin in the Pacific region.",
  "Customer complaints concentrated in two areas: late deliveries during weather events and damaged parcels on high-volume routes.",
  "The routing algorithm update cut average miles per delivery by 6%, saving an estimated $214,000 annualized.",
  "Capital expenditure on the Reno facility is tracking 9% over budget due to permitting delays.",
  "Return processing costs rose 4% as volume outpaced the new sorting line's capacity.",
  "Management recommends expanding the Pacific weekend driver pool and accelerating the Reno permitting workaround.",
]
  .join(" ")
  .repeat(9);

export const BENCHMARKS: BenchmarkItem[] = [
  // --- coding ---
  {
    id: "coding-fix-regex",
    category: "coding",
    title: "Fix a broken regex",
    prompt:
      "This regex is supposed to match ISO dates but also matches '2024-13-45'. Fix it: /\\d{4}-\\d{2}-\\d{2}/",
    expectedTier: "luna",
  },
  {
    id: "coding-debounce",
    category: "coding",
    title: "Write a debounce hook",
    prompt:
      "Write a React useDebouncedValue hook in TypeScript. It should accept a value and a delay in ms, update only after the value stops changing, clean up its timer on unmount, and be fully typed with generics.",
    expectedTier: "terra",
  },
  {
    id: "coding-migrate-callbacks",
    category: "coding",
    title: "Migrate callback API to async/await",
    prompt:
      "Refactor this Node.js module from nested callbacks to async/await, preserving error handling semantics and adding proper TypeScript types:\n\n```js\nfunction loadUser(id, cb) {\n  db.query('SELECT * FROM users WHERE id = ?', [id], (err, rows) => {\n    if (err) return cb(err);\n    if (!rows.length) return cb(new Error('not found'));\n    const user = rows[0];\n    loadPrefs(user.id, (err, prefs) => {\n      if (err) return cb(err);\n      user.prefs = prefs;\n      loadSessions(user.id, (err, sessions) => {\n        if (err) return cb(err);\n        user.sessions = sessions;\n        cb(null, user);\n      });\n    });\n  });\n});\n```",
    expectedTier: "terra",
  },
  // --- architecture ---
  {
    id: "arch-rate-limiter",
    category: "architecture",
    title: "Design a distributed rate limiter",
    prompt:
      "Design a distributed rate limiter for an API gateway serving 50k requests/sec across 12 edge regions. Compare token bucket vs sliding window at this scale, explain where state should live, how you handle clock skew, and what happens during a region failover. Give me the trade-offs, not just a diagram in words.",
    expectedTier: "sol",
  },
  {
    id: "arch-pick-db",
    category: "architecture",
    title: "Pick a database for a leaderboard",
    prompt:
      "I'm building a real-time gaming leaderboard with 2M daily active users, frequent score updates, and global top-100 reads. Should I use Postgres, Redis sorted sets, or something else? One paragraph on why.",
    expectedTier: "luna",
  },
  {
    id: "arch-event-driven",
    category: "architecture",
    title: "Monolith to event-driven migration plan",
    prompt:
      "We have a Rails monolith processing 30k orders/day. I need a phased migration plan to event-driven microservices: what to carve out first, how to keep the monolith authoritative during transition, how to avoid dual-write inconsistencies, and what you'd deliberately NOT extract. Be specific about sequencing.",
    expectedTier: "sol",
  },
  // --- extraction ---
  {
    id: "extract-emails",
    category: "extraction",
    title: "Pull contact info from a signature",
    prompt:
      "Extract the name, title, company, phone, and email from this signature as JSON:\n\nBest,\nPriya Ramanathan\nSenior Director, Platform Engineering\nHexawave Systems\n+1 (415) 555-0173\npriya.r@hexawave.io",
    expectedTier: "luna",
  },
  {
    id: "extract-invoice",
    category: "extraction",
    title: "Extract invoice line items",
    prompt:
      "From this invoice text, extract each line item with description, quantity, unit price, and total as a JSON array:\n\nINVOICE #4482\nWeb hosting (annual) — 1 × $240.00 — $240.00\nSSL certificate — 2 × $45.00 — $90.00\nOverage bandwidth 40GB — 1 × $12.50 — $12.50\nSubtotal $342.50, Tax $27.40, Total $369.90",
    expectedTier: "luna",
  },
  {
    id: "extract-dates",
    category: "extraction",
    title: "Normalize messy dates",
    prompt:
      "Convert every date in this text to ISO 8601 and list them: 'The lease starts March 3rd, 2025, with a review on 9/15/2025 and termination no later than 2026-02-28.'",
    expectedTier: "luna",
  },
  // --- summarization ---
  {
    id: "summarize-ticket",
    category: "summarization",
    title: "One-line support ticket summary",
    prompt:
      "Summarize this support ticket in one sentence for a triage dashboard: 'Hi, since the update yesterday around 2pm our team of 14 people cannot log in via SSO, we get redirected in a loop. Regular password login works. This is blocking all work. We use Okta. Please help ASAP.'",
    expectedTier: "luna",
  },
  {
    id: "summarize-article",
    category: "summarization",
    title: "Summarize a long ops report",
    prompt: `Summarize the following operations report into 5 bullet points for an executive readout:\n\n${LONG_DOC.slice(0, 8000)}`,
    expectedTier: "terra",
  },
  {
    id: "summarize-meeting",
    category: "summarization",
    title: "Meeting notes to action items",
    prompt:
      "Turn these meeting notes into action items with owners:\n\n'Ana: launch moved to the 14th because payments aren't ready. Boris will finish Stripe webhook retries by Friday. Priya to confirm the email copy with legal — they flagged the discount wording. We agreed the free tier stays at 3 projects. Ana to update the changelog draft once Boris confirms.'",
    expectedTier: "luna",
  },
  // --- translation ---
  {
    id: "translate-ui-strings",
    category: "translation",
    title: "Translate UI strings to Spanish",
    prompt:
      "Translate these UI strings to Spanish, keeping placeholders untouched: 'Save changes', 'Discard draft', '{count} items selected', 'Your trial ends in {days} days'.",
    expectedTier: "luna",
  },
  {
    id: "translate-error-message",
    category: "translation",
    title: "Translate an error message to Japanese",
    prompt:
      "Translate to natural, polite Japanese suitable for an end-user error dialog: 'We couldn't process your payment. Your card was declined. Please try a different payment method or contact your bank.'",
    expectedTier: "luna",
  },
  {
    id: "translate-marketing",
    category: "translation",
    title: "Translate marketing copy to German",
    prompt:
      "Translate this product blurb to German, preserving the confident tone and adapting idioms naturally rather than literally: 'Stop babysitting your deploys. Ship on Friday at 5pm and sleep like a baby — our rollback button has your back.'",
    expectedTier: "luna",
  },
  // --- reasoning ---
  {
    id: "reasoning-bat-ball",
    category: "reasoning",
    title: "Classic word problem",
    prompt:
      "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Answer with the amount only.",
    expectedTier: "luna",
  },
  {
    id: "reasoning-priority",
    category: "reasoning",
    title: "Weigh two product options",
    prompt:
      "We can either ship SSO this quarter (requested by 4 enterprise prospects worth ~$220k ARR combined) or rebuild onboarding (current activation is 31%, industry median ~45%). Engineering capacity: one team, one quarter. Which do we pick and why? Think through the second-order effects.",
    expectedTier: "terra",
  },
  {
    id: "reasoning-logic-grid",
    category: "reasoning",
    title: "Multi-constraint logic puzzle",
    prompt:
      "Five engineers (Ada, Babbage, Church, Dijkstra, Hopper) each own exactly one of five deploy slots (Mon–Fri) and one language (Go, Rust, Python, TS, Haskell). Clues: Ada deploys before Church. The Rust user deploys on Wednesday. Dijkstra uses Python and deploys immediately after the Go user. Hopper deploys on Friday and does not use Haskell. Babbage deploys on Monday. Who uses Haskell, and on which day do they deploy? Show your deduction step by step.",
    expectedTier: "terra",
  },
  // --- math ---
  {
    id: "math-tip-split",
    category: "math",
    title: "Split a bill",
    prompt:
      "Three people split a $86.40 dinner with 18% tip. Two had equal shares, the third paid exactly double. What did each pay? Round to cents.",
    expectedTier: "luna",
  },
  {
    id: "math-compound",
    category: "math",
    title: "Compound growth projection",
    prompt:
      "Our MRR is $48k growing 7% month over month. Churn is 3.5% of MRR monthly, applied to the prior month's base. Model the next 12 months month-by-month and tell me the month we cross $100k MRR. Show the formula you used.",
    expectedTier: "terra",
  },
  {
    id: "math-probability",
    category: "math",
    title: "Multi-stage probability proof",
    prompt:
      "A monitoring pipeline has three independent stages with false-negative rates 2%, 5%, and 1%. An incident must pass all three checks undetected to be fully missed. (a) Prove the probability of a fully missed incident. (b) We can halve exactly one stage's false-negative rate — prove which stage minimizes the miss probability. (c) Generalize: for n independent stages, prove the miss probability is minimized by improving the stage with the highest failure rate. Be rigorous.",
    expectedTier: "sol",
  },
  // --- long context ---
  {
    id: "longctx-find-contradiction",
    category: "long-context",
    title: "Find the contradiction in a long report",
    prompt: `Read the following operations report carefully. Somewhere in it, two statements contradict each other about the Reno facility. Quote both and explain the contradiction:\n\n${LONG_DOC}\n\nUpdate from facilities: the Reno build-out remains fully on budget, with all permits secured ahead of schedule.`,
    expectedTier: "terra",
  },
  {
    id: "longctx-executive-brief",
    category: "long-context",
    title: "Executive brief from a long document",
    prompt: `Write a 150-word executive brief from this report, focusing only on financial risks and the two most urgent operational problems:\n\n${LONG_DOC}`,
    expectedTier: "terra",
  },
  {
    id: "longctx-cross-reference",
    category: "long-context",
    title: "Cross-reference claims across a document",
    prompt: `Analyze this report end to end. Identify every claim about cost savings, cross-reference each against the stated risks and overruns, and produce a net assessment of whether the reported savings are credible. Structure the answer as: claims table, risk offsets, verdict.\n\n${LONG_DOC}`,
    expectedTier: "terra",
  },
  // --- tool calling (prompts; the runner attaches representative tool arrays) ---
  {
    id: "tools-weather-lookup",
    category: "tool-calling",
    title: "Single tool lookup",
    prompt:
      "What's the weather in Lisbon right now, and should I bring a jacket tonight? Use the weather tool.",
    expectedTier: "luna",
  },
  {
    id: "tools-multi-step",
    category: "tool-calling",
    title: "Chained tool workflow",
    prompt:
      "Look up the customer with email deniz@acme.co, find their last 3 invoices, check if any are overdue, and if so draft a polite payment reminder email referencing the specific invoice numbers. Use the available tools in the right order.",
    expectedTier: "terra",
  },
  {
    id: "tools-orchestration",
    category: "tool-calling",
    title: "Parallel tool orchestration",
    prompt:
      "For our top 10 accounts by MRR: pull current usage metrics, compare against their plan limits, flag any within 15% of a limit, then for each flagged account draft an upsell note customized to their usage pattern and file it as a CRM task assigned to the account owner. Orchestrate the tools efficiently — parallelize what you can, sequence what you must.",
    expectedTier: "terra",
  },
  // --- writing ---
  {
    id: "writing-slack-update",
    category: "writing",
    title: "Short Slack status update",
    prompt:
      "Write a 3-line Slack update for #eng: the search reindex finished overnight, latency is back under 200ms, and we're monitoring for 24h before closing the incident.",
    expectedTier: "luna",
  },
  {
    id: "writing-changelog",
    category: "writing",
    title: "Product changelog entry",
    prompt:
      "Write a changelog entry for: new CSV import with column mapping, 3x faster dashboard loads, and a fix for the timezone bug in scheduled reports. Tone: clear, a little confident, no hype words. Include a 'Why it matters' line per item.",
    expectedTier: "luna",
  },
  {
    id: "writing-launch-post",
    category: "writing",
    title: "Launch announcement blog post",
    prompt:
      "Write a 900-word launch post for our new usage-based pricing. Cover: why we switched (customers hated seat math), how the migration works (grandfathering for 12 months), a worked cost example for a 20-person team, and an FAQ. Voice: direct, respects the reader's intelligence, zero marketing fluff.",
    expectedTier: "terra",
  },
];

export const BENCHMARK_CATEGORIES = [
  "coding",
  "architecture",
  "extraction",
  "summarization",
  "translation",
  "reasoning",
  "math",
  "long-context",
  "tool-calling",
  "writing",
] as const;
