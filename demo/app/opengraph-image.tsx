import { ImageResponse } from "next/og";

export const dynamic = "force-static";

// Social card. Every number here is a measured value from MODEL_CARD.md.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Forge: GSM8K pass@1 58.8% to 70.0% from GRPO alone on an 8 GB GPU";

const HEADLINE = "Teaching a 1.5B model to reason with RL";

/**
 * Satori has no access to next/font's bundled files, so the display face is
 * fetched from Google Fonts at render time, subset to the glyphs this card
 * actually uses. If the fetch fails (offline build, network blip) the card
 * still renders in Satori's default face rather than failing the route.
 */
async function playfair(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&text=${encodeURIComponent(text)}`,
      // This UA is what makes Google serve a TTF rather than woff2, which
      // Satori cannot read.
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } },
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OgImage() {
  const glyphs = HEADLINE + "58.0%12347.→+ptsForge";
  const display = await playfair(glyphs);
  const font = display ? "Playfair Display" : "serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#F9F8F4",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 72, height: 1, backgroundColor: "#8C9A84" }} />
          <div
            style={{
              display: "flex",
              marginTop: 28,
              color: "#5A6A5E",
              fontSize: 24,
              letterSpacing: 6,
            }}
          >
            FORGE · RL WITH VERIFIABLE REWARDS
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              color: "#2D3A31",
              fontSize: 78,
              fontWeight: 600,
              lineHeight: 1.06,
              letterSpacing: -1,
              fontFamily: font,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ display: "flex", marginTop: 26, color: "#3F5046", fontSize: 30 }}>
            Qwen2.5-1.5B, trained with GRPO on a single 8 GB RTX 5060.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#5A6A5E", fontSize: 22, letterSpacing: 4 }}>
              GSM8K PASS@1
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 10 }}>
              <div
                style={{ display: "flex", color: "#5A6A5E", fontSize: 54, fontFamily: font }}
              >
                58.8%
              </div>
              <div
                style={{
                  display: "flex",
                  color: "#5F7055",
                  fontSize: 54,
                  fontWeight: 600,
                  fontFamily: font,
                }}
              >
                to 70.0%
              </div>
              <div style={{ display: "flex", color: "#A05840", fontSize: 30, fontWeight: 600 }}>
                +11.2 pts
              </div>
            </div>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", color: "#5A6A5E", fontSize: 24 }}>
            RL alone · 4 verifiable rewards · n=1,319
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: display
        ? [{ name: "Playfair Display", data: display, style: "normal", weight: 600 }]
        : undefined,
    },
  );
}
