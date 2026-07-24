"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { duration, easeOut, prefersReducedMotion, staggerStepMs } from "../../../lib/motion";

/**
 * Generalizes RevealBars' "fill once scrolled into view" pattern to arbitrary
 * children: each direct child fades + rises in, staggered, the first time the
 * wrapper crosses into the viewport (IntersectionObserver, fires once).
 * Transform/opacity only. Reduced motion renders every child in its final,
 * static state immediately, no observer involved.
 *
 * `inView` starts false on both server and client renders (so hydration never
 * mismatches) and is only ever flipped true from an effect after mount.
 */
export default function Reveal({
  children,
  as: Tag = "div",
  className,
  stagger = true,
  rootMargin = "0px 0px -10% 0px",
}: {
  children: ReactNode;
  as?: "div" | "section" | "ul" | "ol" | "article";
  className?: string;
  /** Stagger direct children by staggerStepMs. Set false to reveal them together. */
  stagger?: boolean;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

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
      { rootMargin, threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  const items = Array.isArray(children) ? children : [children];

  return (
    <Tag ref={ref as never} className={className}>
      {items.map((child, i) => (
        <span
          key={i}
          className="motion-reveal-item"
          style={
            {
              display: "block",
              opacity: inView ? 1 : 0,
              transform: inView ? "translateY(0)" : "translateY(16px)",
              transitionProperty: "opacity, transform",
              transitionDuration: `${duration.slow}ms`,
              transitionTimingFunction: easeOut,
              transitionDelay: stagger ? `${i * staggerStepMs}ms` : "0ms",
            } as CSSProperties
          }
        >
          {child}
        </span>
      ))}
    </Tag>
  );
}
