"use client";

import { useRef } from "react";
import { gsap, SplitText, useGSAP } from "../../../lib/gsap";
import { charStaggerStep, gsapEaseOut, prefersReducedMotion } from "../../../lib/motion";

/**
 * Headline reveal: splits text into characters with SplitText and rises them
 * in on mount (power4.out, tight 0.03s stagger — one continuous ignition, not
 * a cascading list). Gated behind `document.fonts.ready`: Archivo Black loads
 * with `display: swap`, so splitting before the real font is ready would
 * measure the fallback typeface's character metrics and visibly reflow once
 * it swaps in.
 *
 * Pass the word that should carry the existing `.hot` heat-gradient treatment
 * as `igniteWord` (matched as an exact substring). SplitText is told to
 * `ignore` that span so the gradient's `background-clip: text` keeps working
 * (splitting its characters into wrapper elements would break the clip) —
 * it still rises in at its natural position in the stagger sequence, plus an
 * extra scale-in "settle" beat (transform only) that reads as the ignition
 * point of the headline.
 *
 * Reduced motion: renders the same static markup, SplitText never runs.
 */
export default function TextIgnite({
  children,
  as: Tag = "h1",
  className,
  igniteWord,
}: {
  children: string;
  as?: "h1" | "h2" | "h3" | "span" | "div";
  className?: string;
  /** Word (exact substring match) to receive the `.hot` treatment + settle pop. */
  igniteWord?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;

      let split: InstanceType<typeof SplitText> | null = null;
      let cancelled = false;

      const ready = document.fonts?.ready ?? Promise.resolve();
      ready.then(() => {
        if (cancelled || !el) return;

        // Split into words *and* chars: the word wrappers (inline-block) keep
        // each word whole so a char-split headline never breaks mid-word when
        // it wraps to a second line. Chars still animate individually.
        split = new SplitText(el, {
          type: "words,chars",
          charsClass: "ignite-char",
          wordsClass: "ignite-word",
          ignore: ".hot",
        });

        // Comma-separated querySelectorAll returns nodes in true document
        // order, so the ignite word slots into the stagger at its real
        // position even though SplitText left it unsplit.
        const targets = Array.from(el.querySelectorAll<HTMLElement>(".ignite-char, .hot"));
        const hotEl = el.querySelector<HTMLElement>(".hot");

        gsap.set(targets, { opacity: 0, y: "0.6em" });

        const tl = gsap.timeline();
        tl.to(targets, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: gsapEaseOut,
          stagger: charStaggerStep,
        });

        if (hotEl) {
          const idx = targets.indexOf(hotEl);
          tl.fromTo(
            hotEl,
            { scale: 0.85 },
            { scale: 1, duration: 0.7, ease: gsapEaseOut },
            idx * charStaggerStep,
          );
        }
      });

      return () => {
        cancelled = true;
        split?.revert();
      };
    },
    { scope: ref, dependencies: [children, igniteWord] },
  );

  return (
    <Tag ref={ref as never} className={className}>
      {renderWithIgnite(children, igniteWord)}
    </Tag>
  );
}

function renderWithIgnite(text: string, igniteWord?: string) {
  if (!igniteWord) return text;
  const idx = text.indexOf(igniteWord);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="hot">{igniteWord}</span>
      {text.slice(idx + igniteWord.length)}
    </>
  );
}
