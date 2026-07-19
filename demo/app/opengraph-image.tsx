import { ImageResponse } from "next/og";

// Social card. Every number here is a measured value from HANDOFF.md.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Forge — GSM8K pass@1 58.8% to 70.0% from GRPO alone on an 8 GB GPU";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0C0A09",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 72, height: 8, backgroundColor: "#EF5411" }} />
          <div
            style={{
              display: "flex",
              marginTop: 28,
              color: "#95897E",
              fontSize: 26,
              letterSpacing: 6,
            }}
          >
            FORGE · RL WITH VERIFIABLE REWARDS
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              color: "#F5EFE9",
              fontSize: 96,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: -2,
            }}
          >
            Forged to reason.
          </div>
          <div style={{ display: "flex", marginTop: 24, color: "#C7BEB6", fontSize: 32 }}>
            Qwen2.5-1.5B, heat-treated with GRPO on a single 8 GB RTX 5060.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#95897E", fontSize: 24, letterSpacing: 4 }}>
              GSM8K PASS@1
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 8 }}>
              <div style={{ display: "flex", color: "#C7BEB6", fontSize: 54, fontWeight: 700 }}>
                58.8%
              </div>
              <div style={{ display: "flex", color: "#EF5411", fontSize: 54, fontWeight: 700 }}>
                → 70.0%
              </div>
              <div style={{ display: "flex", color: "#4CC38A", fontSize: 32, fontWeight: 700 }}>
                +11.2 pts
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              color: "#95897E",
              fontSize: 26,
            }}
          >
            RL alone · 86 min · 3.64 GiB VRAM
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
