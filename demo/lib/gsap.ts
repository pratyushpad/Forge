// Single GSAP config module — plugins registered exactly once, browser-guarded
// (Next.js renders this on the server too, where `window` doesn't exist).
// Import `{ gsap, ScrollTrigger, SplitText, useGSAP }` from here everywhere;
// never import "gsap" directly in a component.

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
}

export { gsap, ScrollTrigger, SplitText, useGSAP };
