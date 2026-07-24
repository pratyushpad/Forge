"use client";

import { useRef, useState, type ReactNode } from "react";
import { gsap, useGSAP } from "../../lib/gsap";
import { gsapEaseInOut, prefersReducedMotion } from "../../lib/motion";

/**
 * A native <details>/<summary> disclosure whose open/close is animated
 * (height + opacity) instead of the browser's instant snap. Semantics stay
 * native — <details> keeps driving focus/keyboard/find-in-page behavior; we
 * only intercept the <summary> click to control the timing of the reveal.
 *
 * Opening: set `details.open = true` first (so content lays out and is
 * measurable), then tween the panel from height 0 → "auto".
 * Closing: tween height → 0 first (content stays visible/native-open during
 * the animation), then flip `details.open = false` on complete so it leaves
 * the accessibility tree once fully collapsed.
 *
 * Reduced motion: the open/close still happens, just instantly, no tween.
 */
export default function TraceDisclosure({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mounted = useRef(false);

  useGSAP(
    () => {
      const panel = panelRef.current;
      const details = detailsRef.current;
      if (!panel || !details) return;

      // Native <details> already starts closed with no JS involved — nothing
      // to animate on mount.
      if (!mounted.current) {
        mounted.current = true;
        return;
      }

      if (prefersReducedMotion()) {
        details.open = open;
        gsap.set(panel, { height: open ? "auto" : 0, opacity: open ? 1 : 0 });
        return;
      }

      if (open) {
        details.open = true;
        gsap.fromTo(
          panel,
          { height: 0, opacity: 0 },
          { height: "auto", opacity: 1, duration: 0.4, ease: gsapEaseInOut },
        );
      } else {
        gsap.to(panel, {
          height: 0,
          opacity: 0,
          duration: 0.3,
          ease: gsapEaseInOut,
          onComplete: () => {
            if (detailsRef.current) detailsRef.current.open = false;
          },
        });
      }
    },
    { dependencies: [open], scope: detailsRef },
  );

  return (
    <details className="trace-details" ref={detailsRef}>
      <summary
        onClick={(e) => {
          // We drive the open/close timing ourselves (see above); the native
          // toggle would otherwise snap instantly.
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {summary}
      </summary>
      <div className="trace-panel" ref={panelRef}>
        {children}
      </div>
    </details>
  );
}
