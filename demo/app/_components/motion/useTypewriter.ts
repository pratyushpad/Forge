"use client";

import { useRef, useState } from "react";
import { prefersReducedMotion } from "../../../lib/motion";

// Typewriter reveal — gives cached (real) outputs a live-streaming feel and works
// on a static host. Renders instantly under prefers-reduced-motion.
export function useTypewriter() {
  const [text, setText] = useState("");
  const [done, setDone] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const run = (full: string, durationMs = 2500) =>
    new Promise<void>((resolve) => {
      if (timer.current) clearInterval(timer.current);
      if (prefersReducedMotion()) {
        setText(full);
        setDone(true);
        resolve();
        return;
      }
      setText("");
      setDone(false);
      const step = Math.max(1, Math.round(full.length / (durationMs / 33)));
      let i = 0;
      timer.current = setInterval(() => {
        i += step;
        setText(full.slice(0, i));
        if (i >= full.length) {
          clearInterval(timer.current!);
          setDone(true);
          resolve();
        }
      }, 33);
    });
  return { text, done, run };
}
