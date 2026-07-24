"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "../../../lib/gsap";
import { gsapEaseInOut, prefersReducedMotion } from "../../../lib/motion";

/**
 * Pointer-follow "magnetic" wrapper: the child drifts a fraction of the
 * pointer's offset from center via gsap.quickTo (transform only). Gated
 * behind `(hover: hover) and (pointer: fine)` through gsap.matchMedia — touch
 * and coarse-pointer devices never attach a listener and the element stays
 * perfectly static. Reduced motion: skipped entirely, same static result.
 */
export default function Magnetic({
  children,
  strength = 0.3,
  className,
}: {
  children: ReactNode;
  /** Fraction of the pointer's offset from center the element travels (0–1). */
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;

      const mm = gsap.matchMedia();

      mm.add("(hover: hover) and (pointer: fine)", () => {
        const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: gsapEaseInOut });
        const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: gsapEaseInOut });

        const onMove = (e: PointerEvent) => {
          const rect = el.getBoundingClientRect();
          xTo((e.clientX - (rect.left + rect.width / 2)) * strength);
          yTo((e.clientY - (rect.top + rect.height / 2)) * strength);
        };
        const onLeave = () => {
          xTo(0);
          yTo(0);
        };

        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);

        // matchMedia reverts the quickTo tweens itself on condition change;
        // the DOM listeners are ours to remove.
        return () => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", onLeave);
        };
      });

      // Coarse pointers / touch: the media condition above never matches, so
      // no listener is ever attached and the element stays put.

      return () => mm.revert();
    },
    { scope: ref, dependencies: [strength] },
  );

  return (
    <div ref={ref} className={className} style={{ display: "inline-block", willChange: "transform" }}>
      {children}
    </div>
  );
}
