"use client";

import PathDraw from "./motion/PathDraw";

// Forged section header — a drawn heat-rule (PathDraw) + a stamped hallmark
// numeral. Shipped first on the home page (Phase 1); extracted here so every
// route can share it in place of the plain `.sec-label` eyebrow. Its
// `.forge-sec*` CSS lives in globals.css and is already global.
export default function ForgeSecLabel({ num, label }: { num: string; label: string }) {
  return (
    <div className="forge-sec">
      <svg className="forge-sec-rule" width="48" height="6" viewBox="0 0 48 6" aria-hidden="true">
        <PathDraw d="M0 3 H48" stroke="var(--ember)" strokeWidth={2} strokeLinecap="round" duration={0.7} />
      </svg>
      <span className="forge-sec-num">{num}</span>
      <span className="forge-sec-label">{label}</span>
    </div>
  );
}
