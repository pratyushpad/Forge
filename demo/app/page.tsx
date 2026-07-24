"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import examplesData from "../public/examples.json";
import { gsap, ScrollTrigger, useGSAP } from "../lib/gsap";
import { gsapEaseInOut, gsapEaseOut, prefersReducedMotion, replayDuration } from "../lib/motion";
import { useTypewriter } from "./_components/motion/useTypewriter";
import TextIgnite from "./_components/motion/TextIgnite";
import CountUp from "./_components/motion/CountUp";
import Magnetic from "./_components/motion/Magnetic";
import PathDraw from "./_components/motion/PathDraw";
import ForgeSecLabel from "./_components/ForgeSecLabel";

// The OGL shader chunk stays out of the server bundle and the initial client
// payload — it's pure decoration behind the (server-rendered) H1, never the
// LCP element. `null` while loading keeps the DOM identical server/client.
const HeroShader = dynamic(() => import("./_components/HeroShader"), { ssr: false });

// Same three chamfered-F paths as ForgeMark.tsx (viewBox 0 0 40 40), drawn
// large as a low-contrast hero watermark instead of rendered as a nav glyph.
const FORGE_MARK_PATHS = [
  "M11 9 H17 V27 L14 31 L11 27 Z",
  "M11 9 H30 L24 16 H11 Z",
  "M11 19 H26 L20 25 H11 Z",
];

type ModelOut = {
  raw: string;
  reasoning: string;
  answer: string | null;
  correct: boolean;
  latency_s?: number;
};
type Example = { question: string; gold: string; models: { base: ModelOut; tuned: ModelOut } };

const EXAMPLES = (examplesData as { examples: Example[] }).examples;
const BASE_WINS = EXAMPLES.filter((e) => e.models.base.correct).length;
const TUNED_WINS = EXAMPLES.filter((e) => e.models.tuned.correct).length;

// Only show an answer verbatim when it's a clean numeric value — the base model
// sometimes emits nothing parseable, or a raw expression instead of a number.
// Those render as "no clear answer", never the raw string or "null".
const cleanAnswer = (a: string | null): string | null =>
  a && /^[$-]?[\d.,]+%?$/.test(a.trim()) ? a.trim() : null;

function ModelColumn({
  kind,
  out,
  streaming,
  gold,
  colRef,
  flareRef,
  sparksRef,
}: {
  kind: "base" | "tuned";
  out: ModelOut | null;
  streaming: { text: string; done: boolean };
  gold: string;
  colRef?: RefObject<HTMLDivElement | null>;
  flareRef?: RefObject<HTMLSpanElement | null>;
  sparksRef?: RefObject<HTMLSpanElement | null>;
}) {
  const label = kind === "tuned" ? "GRPO-tuned" : "Base";
  const sub = kind === "tuned" ? "Qwen2.5-1.5B + GRPO" : "Qwen2.5-1.5B-Instruct";
  const showAnswer = out && streaming.done;
  const clean = out ? cleanAnswer(out.answer) : null;
  const paneRef = useRef<HTMLDivElement | null>(null);

  // Follow the stream, but only when already near the bottom — scrolling up to
  // read must not get yanked back down.
  useEffect(() => {
    const el = paneRef.current;
    if (!el || streaming.done) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 64) el.scrollTop = el.scrollHeight;
  }, [streaming.text, streaming.done]);

  return (
    <div className={`col ${kind}`} ref={colRef}>
      {kind === "tuned" && (
        <>
          {/* The strike payoff — both start fully transparent; a GSAP
              timeline in Home fires them once the tuned answer lands correct. */}
          <span className="strike-flare" ref={flareRef} aria-hidden="true" />
          <span className="strike-sparks" ref={sparksRef} aria-hidden="true">
            {Array.from({ length: 7 }).map((_, i) => (
              <span key={i} className="spark" />
            ))}
          </span>
        </>
      )}
      <h3>
        {label} <span className={`badge ${kind}`}>{sub}</span>
      </h3>
      <div className="sub">reasoning trace</div>
      <div className="reasoning" ref={paneRef}>
        {streaming.text}
        {!streaming.done && <span className="cursor">▋</span>}
      </div>
      <div className="answer">
        <span className="label">answer</span>
        {showAnswer ? (
          <>
            <span className={`val reveal ${out!.correct ? "ok" : "bad"}`}>{clean ?? "—"}</span>
            <span className={`mark reveal ${out!.correct ? "ok" : "bad"}`}>
              {out!.correct
                ? "✓ correct"
                : clean
                  ? `✗ wrong · gold ${gold}`
                  : `✗ no clear answer · gold ${gold}`}
            </span>
          </>
        ) : (
          <span className="val pending" aria-hidden="true">
            &nbsp;
          </span>
        )}
      </div>
    </div>
  );
}

function VerdictChip({ label, out }: { label: string; out: ModelOut }) {
  const clean = cleanAnswer(out.answer);
  return (
    <span className={`vchip ${out.correct ? "ok" : "bad"}`}>
      {label} · {clean ?? "no clear answer"} {out.correct ? "✓" : "✗"}
    </span>
  );
}

const enter = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

export default function Home() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [active, setActive] = useState<Example | null>(null);
  const [running, setRunning] = useState(false);
  const [strike, setStrike] = useState(false);
  const [enableShader, setEnableShader] = useState(false);
  const base = useTypewriter();
  const tuned = useTypewriter();

  const heroRef = useRef<HTMLElement | null>(null);
  const coolRef = useRef(0);
  const sideRef = useRef<HTMLDivElement | null>(null);
  const tunedColRef = useRef<HTMLDivElement | null>(null);
  const flareRef = useRef<HTMLSpanElement | null>(null);
  const sparksRef = useRef<HTMLSpanElement | null>(null);

  // The renderer never even gets created under reduced motion (checked once,
  // client-only, after mount — so server/first-paint DOM has no canvas at all
  // and there's nothing to hydrate-mismatch on).
  useEffect(() => {
    if (!prefersReducedMotion()) setEnableShader(true);
  }, []);

  // Scroll cools the molten field: a scrub ScrollTrigger over the hero writes
  // scroll progress into a ref (not React state) so the shader's rAF loop can
  // ease toward it without re-rendering this component on every scroll tick.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const st = ScrollTrigger.create({
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
          onUpdate: (self) => {
            coolRef.current = self.progress;
          },
        });
        return () => st.kill();
      });
      return () => mm.revert();
    },
    { scope: heroRef },
  );

  const run = async (i: number) => {
    const ex = EXAMPLES[i];
    setActiveIdx(i);
    setActive(ex);
    setRunning(true);
    setStrike(false);
    await Promise.all([
      base.run(ex.models.base.reasoning, replayDuration(ex.models.base)),
      tuned.run(ex.models.tuned.reasoning, replayDuration(ex.models.tuned)),
    ]);
    setRunning(false);
    // The strike only fires when the forged model actually lands the right
    // answer — one held-out example has both models wrong, and that stays a
    // cold, uncelebrated miss on both sides. No theater over a real result.
    if (ex.models.tuned.correct) setStrike(true);
  };

  useEffect(() => {
    run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The strike — a hammer-pulse on the tuned column, its heat tick flaring,
  // and a spark burst from the heat bar. Event-driven off `strike`, not
  // scroll-pinned, so it's robust to wherever the section happens to sit.
  useGSAP(
    () => {
      if (!strike) return;
      const tunedEl = tunedColRef.current;
      if (!tunedEl) return;

      if (prefersReducedMotion()) {
        // Reduced motion still gets the feedback — just the final flare
        // state, no movement.
        if (flareRef.current) gsap.set(flareRef.current, { opacity: 1 });
        return;
      }

      const tl = gsap.timeline();
      tl.fromTo(tunedEl, { scale: 1 }, { scale: 0.985, duration: 0.08, ease: "power1.out" })
        .to(tunedEl, { scale: 1.025, duration: 0.14, ease: gsapEaseOut })
        .to(tunedEl, { scale: 1, duration: 0.24, ease: gsapEaseInOut });

      if (flareRef.current) {
        gsap.set(flareRef.current, { opacity: 0 });
        tl.to(flareRef.current, { opacity: 1, duration: 0.1, ease: "power1.out" }, 0.04).to(
          flareRef.current,
          { opacity: 0.3, duration: 0.6, ease: gsapEaseInOut },
          ">",
        );
      }

      if (sparksRef.current) {
        const sparks = Array.from(sparksRef.current.querySelectorAll<HTMLElement>(".spark"));
        gsap.set(sparks, { opacity: 0, x: 0, y: 0, scale: 0.6 });
        sparks.forEach((s, i) => {
          const angle = (i / sparks.length) * Math.PI * 2;
          const dist = 26 + (i % 3) * 10;
          tl.to(
            s,
            {
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist - 8,
              opacity: 1,
              scale: 1,
              duration: 0.22,
              ease: "power2.out",
            },
            0.02,
          ).to(s, { opacity: 0, duration: 0.4, ease: gsapEaseInOut }, 0.24);
        });
      }

      return () => {
        tl.kill();
      };
    },
    { dependencies: [strike], scope: sideRef },
  );

  const settled = active && base.done && tuned.done && !running;

  return (
    <div className="wrap">
      <header ref={heroRef as never}>
        {enableShader && <HeroShader coolRef={coolRef} />}

        <svg className="hero-watermark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="hero-watermark-heat" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--ember-deep)" />
              <stop offset="0.55" stopColor="var(--ember)" />
              <stop offset="1" stopColor="var(--glow)" />
            </linearGradient>
          </defs>
          {FORGE_MARK_PATHS.map((d, i) => (
            <PathDraw
              key={i}
              d={d}
              duration={1.1}
              stroke="url(#hero-watermark-heat)"
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          ))}
        </svg>

        <div className="hero-inner">
          <div className="enter" style={enter(320)}>
            <div className="bar" />
            <div className="eyebrow">Forge · RL with verifiable rewards</div>
          </div>
          <TextIgnite as="h1" igniteWord="reason">
            Forged to reason
          </TextIgnite>
          <p className="enter" style={enter(380)}>
            Qwen2.5-1.5B, heat-treated with GRPO (reinforcement learning against a math checker,
            the DeepSeek-R1 technique) on a single 8GB RTX 5060. Watch the cold base model and the
            forged model solve the same problem, side by side.
          </p>
        </div>

        <div className="statbar">
          <div className="stat hero enter" style={enter(440)}>
            <div className="k">GSM8K pass@1</div>
            <div className="v">
              <CountUp value={58.8} decimals={1} suffix="%" /> <span className="arrow">→</span>{" "}
              <CountUp hot value={70.0} decimals={1} suffix="%" />{" "}
              <small className="delta">
                <CountUp value={11.2} decimals={1} prefix="+" suffix=" pts" />
              </small>
            </div>
          </div>
          <div className="stat enter" style={enter(490)}>
            <div className="k">Forgetting (ARC)</div>
            <div className="v">
              <CountUp value={69.5} decimals={1} /> → <CountUp value={68.5} decimals={1} />{" "}
              <small>≈flat</small>
            </div>
          </div>
          <div className="stat enter" style={enter(540)}>
            <div className="k">Train time</div>
            <div className="v">
              <CountUp value={86} suffix=" min" />{" "}
              <small>
                <CountUp value={3.64} decimals={2} suffix=" GiB" />
              </small>
            </div>
          </div>
          <div className="stat enter" style={enter(590)}>
            <div className="k">Served</div>
            <div className="v">
              <CountUp value={228} /> <small>tok/s</small>
            </div>
          </div>
        </div>
      </header>

      <section>
        <ForgeSecLabel num="01" label="Pick a problem" />
        <div className="picker">
          {EXAMPLES.map((e, i) => (
            <button
              key={i}
              className={`ex-card ${i === activeIdx ? "active" : ""}`}
              onClick={() => run(i)}
              disabled={running}
            >
              <span className="ex-num">{String(i + 1).padStart(2, "0")}</span>
              <span className="ex-body">
                <span className="ex-q">
                  {e.question.trim().length > 96
                    ? e.question.trim().slice(0, 96).trim() + "…"
                    : e.question.trim()}
                </span>
                {i === activeIdx && (
                  <span className="ex-replay">{running ? "solving…" : "↻ replay"}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="mode">
          Replaying <b>real cached outputs</b> from both models (generated offline so this page
          always works). Point <code>FORGE_FALLBACK_URL</code> at a live endpoint for on-the-fly
          inference.
        </div>
      </section>

      <section ref={sideRef}>
        <ForgeSecLabel num="02" label="Side by side" />
        <div className="grid">
          <ModelColumn
            kind="base"
            out={active?.models.base ?? null}
            streaming={base}
            gold={active?.gold ?? ""}
          />
          <ModelColumn
            kind="tuned"
            out={active?.models.tuned ?? null}
            streaming={tuned}
            gold={active?.gold ?? ""}
            colRef={tunedColRef}
            flareRef={flareRef}
            sparksRef={sparksRef}
          />
        </div>

        <div className="verdictbar">
          {settled ? (
            <div className={`verdict${strike ? " forge-stamp" : ""}`}>
              <VerdictChip label="Base" out={active!.models.base} />
              <VerdictChip label="GRPO-tuned" out={active!.models.tuned} />
              <span className="gold">gold answer: {active!.gold}</span>
            </div>
          ) : (
            <div className="verdict pending">solving…</div>
          )}
          <div className="tally">
            Base {BASE_WINS}/{EXAMPLES.length} · GRPO-tuned {TUNED_WINS}/{EXAMPLES.length} on these
            examples
          </div>
        </div>
      </section>

      <section>
        <ForgeSecLabel num="03" label="Go deeper" />
        <h2>The rest of the evidence</h2>
        <div className="deeper">
          <Magnetic strength={0.12} className="deep-magnet">
            <Link className="deep-card" href="/playground">
              <span className="deep-glow" aria-hidden="true" />
              <span className="deep-k">Playground</span>
              <span className="deep-t">Run it yourself, live</span>
              <span className="deep-d">
                Type any problem. Both models answer side by side on a real GPU, streaming.
              </span>
            </Link>
          </Magnetic>
          <Magnetic strength={0.12} className="deep-magnet">
            <Link className="deep-card" href="/method">
              <span className="deep-glow" aria-hidden="true" />
              <span className="deep-k">Method</span>
              <span className="deep-t">How GRPO actually works</span>
              <span className="deep-d">
                The reward stack, and the bug where every reward was zero so the run learned
                nothing.
              </span>
            </Link>
          </Magnetic>
          <Magnetic strength={0.12} className="deep-magnet">
            <Link className="deep-card" href="/results">
              <span className="deep-glow" aria-hidden="true" />
              <span className="deep-k">Results</span>
              <span className="deep-t">Every number, and its source</span>
              <span className="deep-d">
                Strict vs lenient scoring, the forgetting control, quantization cost, serving
                latency.
              </span>
            </Link>
          </Magnetic>
          <Magnetic strength={0.12} className="deep-magnet">
            <Link className="deep-card" href="/traces">
              <span className="deep-glow" aria-hidden="true" />
              <span className="deep-k">Traces</span>
              <span className="deep-t">Read the reasoning</span>
              <span className="deep-d">
                Unedited completions on held-out problems, including the one both models miss.
              </span>
            </Link>
          </Magnetic>
        </div>
      </section>

      <footer>
        Base {BASE_WINS}/{EXAMPLES.length} vs GRPO-tuned {TUNED_WINS}/{EXAMPLES.length} on the
        examples above ·{" "}
        <a href="https://github.com/pratyushpad/Forge" target="_blank" rel="noreferrer">
          source &amp; model card on GitHub
        </a>
      </footer>
    </div>
  );
}
