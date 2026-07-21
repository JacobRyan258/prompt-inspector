import { TIERS } from "@prompt-inspector/core/pricing";
import type { Tier } from "@prompt-inspector/core/types";
import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

const SIZE = { width: 1200, height: 630 };

const TIER_HEX: Record<Tier, string> = {
  luna: "#38bdf8",
  terra: "#a78bfa",
  sol: "#fbbf24",
};

type Style = "kimi-says" | "almost-wasted" | "downgraded" | "audited";

const STYLES: Style[] = ["kimi-says", "almost-wasted", "downgraded", "audited"];

function headlineFor(style: Style, label: string, savings: number): string {
  switch (style) {
    case "almost-wasted":
      return `You almost wasted ${savings}%.`;
    case "downgraded":
      return "Prompt successfully downgraded.";
    case "audited":
      return "This prompt has been financially audited.";
    default:
      return `Kimi says this only needs ${label}.`;
  }
}

interface FontSpec {
  name: string;
  data: ArrayBuffer;
  weight: 500 | 700;
  style: "normal";
}

/**
 * Best-effort Geist load via the Google Fonts CSS API (requests TTF with an
 * old UA string). Falls back to the ImageResponse default font so the route
 * always returns a valid PNG, even offline.
 */
async function loadGeist(): Promise<FontSpec[]> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Geist:wght@500;700&display=swap",
      {
        headers: {
          // Old UA → Google serves plain TTF, which Satori can embed.
          "user-agent": "Mozilla/5.0 (Windows NT 6.1)",
        },
        cache: "force-cache",
      },
    ).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));

    const blocks = css.split("@font-face").slice(1);
    const fonts: FontSpec[] = [];
    for (const block of blocks) {
      const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
      const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
      if (!url || (weight !== "500" && weight !== "700")) continue;
      const data = await fetch(url, { cache: "force-cache" }).then((r) =>
        r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))),
      );
      fonts.push({ name: "Geist", data, weight: Number(weight) as 500 | 700, style: "normal" });
    }
    return fonts;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const tierParam = searchParams.get("tier");
  const tier: Tier =
    tierParam === "terra" || tierParam === "sol" ? tierParam : "luna";
  const label = TIERS[tier].label;

  const savingsRaw = Number.parseInt(searchParams.get("savings") ?? "0", 10);
  const savings = Math.min(
    99,
    Math.max(0, Number.isFinite(savingsRaw) ? savingsRaw : 0),
  );

  const styleParam = searchParams.get("style") as Style | null;
  const style: Style =
    styleParam && STYLES.includes(styleParam) ? styleParam : "kimi-says";

  const fonts = await loadGeist();
  const fontFamily = fonts.length > 0 ? "Geist" : "sans-serif";
  const tierColor = TIER_HEX[tier];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#09090b",
          padding: "64px 72px",
          fontFamily,
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "#a1a1aa",
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "0.22em",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              backgroundColor: tierColor,
              display: "flex",
            }}
          />
          PROMPT INSPECTOR
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "#fafafa",
            }}
          >
            {headlineFor(style, label, savings)}
          </div>
        </div>

        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            fontSize: 26,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              border: `2px solid ${tierColor}66`,
              borderRadius: 999,
              padding: "10px 24px",
              color: tierColor,
              fontWeight: 500,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                backgroundColor: tierColor,
                display: "flex",
              }}
            />
            {label}
          </div>
          <div style={{ color: "#34d399", fontWeight: 500, display: "flex" }}>
            saved {savings}% vs Sol
          </div>
          <div
            style={{
              marginLeft: "auto",
              color: "#52525b",
              display: "flex",
            }}
          >
            promptinspector.local
          </div>
        </div>
      </div>
    ),
    { ...SIZE, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
