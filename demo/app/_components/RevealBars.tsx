"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { staggerStepMs } from "../../lib/motion";

export type BarRow = { name: string; value: number; label: string; tuned?: boolean };

/**
 * Bars that fill once scrolled into view. The fill is a clip-path reveal over a
 * fixed width — the geometry never animates, so nothing reflows mid-transition.
 * Reduced motion is handled globally (transitions collapse to ~0ms, final state).
 */
export default function RevealBars({ rows, max = 100 }: { rows: BarRow[]; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setInView(true), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {rows.map((row, i) => (
        <div className="bar-row" key={row.name}>
          <span className="name">{row.name}</span>
          <div className="bar-track">
            <div
              className={`bar-fill ${row.tuned ? "tuned" : "base"} ${inView ? "shown" : ""}`}
              style={
                {
                  width: `${(row.value / max) * 100}%`,
                  transitionDelay: `${i * staggerStepMs}ms`,
                } as CSSProperties
              }
            />
          </div>
          <span className="bar-val">{row.label}</span>
        </div>
      ))}
    </div>
  );
}
