"use client";

import { X } from "lucide-react";
import { useState } from "react";

export function DemoBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3">
      <p className="text-sm text-amber-400">
        Showing demo data. Point your SDK at the proxy and these become your
        numbers.
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="ml-auto rounded p-1 text-amber-400/70 transition-colors hover:text-amber-400"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
