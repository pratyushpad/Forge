"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap, useGSAP } from "../../../lib/gsap";
import { duration as motionDuration, gsapEaseOut, prefersReducedMotion } from "../../../lib/motion";

const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * Counts up to `value` once its wrapper scrolls into view. An invisible
 * "sizer" span holds the final formatted string in normal flow so the
 * wrapper's box never resizes as digits change width (no CLS); the visible,
 * animating counter sits absolutely positioned on top of it.
 *
 * Reduced motion: the final value renders immediately, no tween.
 * Screen readers get one clean announcement of the final value rather than a
 * stream of in-between numbers (the animating span is aria-hidden).
 */
export default function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = motionDuration.slow / 1000, // 0.6s, doubled below for a readable count vs. a UI transition
  className,
  hot = false,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Tween duration in seconds. */
  duration?: number;
  className?: string;
  /** Fill the digits with the `--heat` gradient. Applied to the text-bearing
   *  spans (not the wrapper) so background-clip:text renders reliably even
   *  though the animating value sits in an absolutely-positioned span. */
  hot?: boolean;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);
  const [inView, setInView] = useState(false);
  const durationSec = duration * 2;

  const format = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`;
  const final = format(value);

  // Fires on mount (IO reports current intersection immediately) and again if
  // `value` changes on an already-mounted, already-visible instance — covers
  // both a fresh mount and a soft-navigated prop swap.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
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
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  useGSAP(
    () => {
      if (!inView || prefersReducedMotion()) return;
      const counter = { n: 0 };
      gsap.to(counter, {
        n: value,
        duration: durationSec,
        ease: gsapEaseOut,
        onUpdate: () => setDisplay(counter.n),
      });
    },
    { dependencies: [inView, value, durationSec], scope: ref },
  );

  return (
    <span ref={ref} className={className} style={{ position: "relative", display: "inline-block" }}>
      <span
        aria-hidden="true"
        className={hot ? "hot" : undefined}
        style={{ visibility: "hidden", fontVariantNumeric: "tabular-nums" }}
      >
        {final}
      </span>
      <span
        aria-hidden="true"
        className={hot ? "hot" : undefined}
        style={{ position: "absolute", inset: 0, fontVariantNumeric: "tabular-nums" }}
      >
        {format(display)}
      </span>
      <span style={srOnly}>{final}</span>
    </span>
  );
}
