// Single motion vocabulary for the demo. Every duration/easing used in TS or
// CSS lives here (CSS mirrors these as --dur-* / --ease-* tokens in globals.css).

export const duration = {
  fast: 120, // press feedback
  base: 200, // hovers, reveals
  slow: 600, // bar fills, section entrances
} as const;

export const easeOut = "cubic-bezier(0.23, 1, 0.32, 1)";

export const staggerStepMs = 60; // hero entrance cascade

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type TimedOutput = { reasoning: string; latency_s?: number };

// Replay duration derived from each output's real measured latency_s, slowed to
// reading speed. Floored/capped by text length so pacing stays readable, and
// latency clamped positive (one cached value is negative from clock skew).
export function replayDuration(out: TimedOutput): number {
  const len = out.reasoning.length;
  const lat = Math.max(0.4, out.latency_s ?? 0);
  let ms = lat * 3500;
  ms = Math.max(ms, (len / 260) * 1000);
  ms = Math.min(ms, (len / 70) * 1000);
  return Math.min(6000, Math.max(1200, ms));
}
