"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { duration, easeOut, prefersReducedMotion, staggerStepMs } from "../../lib/motion";

export type RewardItem = { name: string; value: number; tone: string; detail: string };

/**
 * The reward budget, drawn to scale (`.stackbar`) plus its legend
 * (`.rewardlist`). Segments grow in from zero width via `transform: scaleX`
 * (transform-only — the flex layout that sizes each segment never changes,
 * only its paint scale), staggered, the first time the bar scrolls into view.
 * Hovering a legend row highlights its matching segment and vice versa.
 */
export default function RewardStack({ items, max }: { items: RewardItem[]; max: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect(); // once
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div
        className="stackbar"
        ref={ref}
        role="img"
        aria-label={`Reward budget of ${max} points: ${items.map((r) => `${r.name} ${r.value}`).join(", ")}`}
      >
        {items.map((r, i) => (
          <div
            key={r.name}
            className={`stackseg ${r.tone}${hovered === r.name ? " hi" : ""}`}
            style={
              {
                flexGrow: r.value,
                transform: inView ? "scaleX(1)" : "scaleX(0)",
                transformOrigin: "left center",
                transitionProperty: "transform, filter",
                transitionDuration: `${duration.slow}ms, ${duration.base}ms`,
                transitionTimingFunction: easeOut,
                transitionDelay: `${i * staggerStepMs}ms, 0ms`,
              } as CSSProperties
            }
            title={`${r.name}: +${r.value}`}
            onMouseEnter={() => setHovered(r.name)}
            onMouseLeave={() => setHovered((h) => (h === r.name ? null : h))}
          />
        ))}
      </div>

      <ul className="rewardlist">
        {items.map((r) => (
          <li
            key={r.name}
            className={hovered === r.name ? "hi" : undefined}
            onMouseEnter={() => setHovered(r.name)}
            onMouseLeave={() => setHovered((h) => (h === r.name ? null : h))}
          >
            <span className={`swatch ${r.tone}`} aria-hidden="true" />
            <span className="rw-name">{r.name}</span>
            <span className="rw-val">+{r.value.toFixed(2)}</span>
            <span className="rw-detail">{r.detail}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
