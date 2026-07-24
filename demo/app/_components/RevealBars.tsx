"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { staggerStepMs } from "../../lib/motion";
import CountUp from "./motion/CountUp";

export type BarRow = {
  name: string;
  value: number;
  label: string;
  tuned?: boolean;
  /** Decimal places for the CountUp value label. Defaults to 0. */
  decimals?: number;
};

/**
 * Bars that fill once scrolled into view. The fill is a clip-path reveal over a
 * fixed width — the geometry never animates, so nothing reflows mid-transition.
 * Reduced motion is handled globally (transitions collapse to ~0ms, final state).
 *
 * The value label counts up (CountUp) instead of rendering static text, and
 * the tuned row gets a faint `--cold` ghost tick at the base row's value —
 * a still marker behind the moving fill so the delta reads at a glance.
 */
export default function RevealBars({ rows, max = 100 }: { rows: BarRow[]; max?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const baseValue = rows.find((r) => !r.tuned)?.value;

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
      {rows.map((row, i) => {
        const ghostPct = row.tuned && baseValue !== undefined ? (baseValue / max) * 100 : null;
        return (
          <div className="bar-row" key={row.name}>
            <span className="name">{row.name}</span>
            <div className="bar-track">
              {ghostPct !== null && (
                <span
                  className="bar-ghost"
                  style={{ left: `${ghostPct}%` } as CSSProperties}
                  aria-hidden="true"
                />
              )}
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
            <CountUp value={row.value} decimals={row.decimals ?? 0} suffix="%" className="bar-val" />
          </div>
        );
      })}
    </div>
  );
}
