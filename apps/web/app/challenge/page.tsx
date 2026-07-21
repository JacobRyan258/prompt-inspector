import type { Metadata } from "next";
import { ChallengeClient } from "@/components/challenge-client";

export const metadata: Metadata = { title: "Challenge the Router" };

export default function ChallengePage() {
  return (
    <div className="flex flex-col gap-8 py-10">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
          Challenge the Router
        </h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          One prompt, all three tiers, side by side. If Luna&apos;s answer looks
          as good as Sol&apos;s, the router was right — and you keep the
          difference.
        </p>
      </div>
      <ChallengeClient />
    </div>
  );
}
