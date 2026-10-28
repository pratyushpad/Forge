"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { IS_STATIC } from "../lib/site";
import examplesData from "../public/examples.json";
import { gsap, useGSAP } from "../lib/gsap";
import { gsapEaseOut, prefersReducedMotion, replayDuration } from "../lib/motion";
import { useTypewriter } from "./_components/motion/useTypewriter";
import HeadlineReveal from "./_components/motion/HeadlineReveal";
import CountUp from "./_components/motion/CountUp";
import PathDraw from "./_components/motion/PathDraw";
import VineRule from "./_components/motion/VineRule";
import ForgeSecLabel from "./_components/ForgeSecLabel";

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
}: {
  kind: "base" | "tuned";
  out: ModelOut | null;
  streaming: { text: string; done: boolean };
  gold: string;
  colRef?: RefObject<HTMLDivElement | null>;
  flareRef?: RefObject<HTMLSpanElement | null>;
}) {
  const label = kind === "tuned" ? "Tuned" : "Base";
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
        // Confirmation payoff — starts fully transparent; a GSAP timeline in
        // Home fires it once the tuned answer lands correct. A single soft
        // glow, not a particle effect.
        <span className="confirm-flare" ref={flareRef} aria-hidden="true" />
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
            <span className={`val reveal ${out!.correct ? "ok" : "bad"}`}>{clean ?? "–"}</span>
            <span className={`mark reveal ${out!.correct ? "ok" : "bad"}`}>
              {out!.correct
                ? "✓ correct"
                : clean
                  ? `✗ wrong, gold ${gold}`
                  : `✗ no clear answer, gold ${gold}`}
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

// The training-signal line inside the hero arch — a smoothed approximation of
// the real mean-group-reward curve (1.23 → 2.80 over 750 steps; see /results
// for the full plot). Waypoints are illustrative of the real trajectory shape,
// not a resample of the raw log. Drawn as a climbing stem, terracotta bud at
// the tip.
const CURVE_PATH =
  "M0 62 C 22 58, 30 46, 48 42 C 68 38, 78 30, 96 26 C 116 22, 128 18, 148 14 C 168 10, 190 8, 212 6";

const ARROW = (
  <span className="deep-arrow" aria-hidden="true">
    <svg width="28" height="10" viewBox="0 0 28 10" fill="none">
      <path
        d="M0 5h26M22 1l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

export default function Home() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [active, setActive] = useState<Example | null>(null);
  const [running, setRunning] = useState(false);
  const [strike, setStrike] = useState(false);
  const base = useTypewriter();
  const tuned = useTypewriter();

  const sideRef = useRef<HTMLDivElement | null>(null);
  const tunedColRef = useRef<HTMLDivElement | null>(null);
  const flareRef = useRef<HTMLSpanElement | null>(null);

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
    // The confirmation only fires when the tuned model actually lands the
    // right answer — one held-out example has both models wrong, and that
    // stays an uncelebrated miss on both sides. No theater over a real result.
    if (ex.models.tuned.correct) setStrike(true);
  };

  useEffect(() => {
    run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The confirmation cue: a soft accent glow on the tuned column, plus a
  // barely-there scale settle on its verdict chip. Event-driven off `strike`.
  useGSAP(
    () => {
      if (!strike) return;
      const tunedEl = tunedColRef.current;
      if (!tunedEl) return;

      if (prefersReducedMotion()) {
        if (flareRef.current) gsap.set(flareRef.current, { opacity: 1 });
        return;
      }

      const tl = gsap.timeline();
      tl.fromTo(tunedEl, { scale: 1 }, { scale: 0.99, duration: 0.08, ease: "power1.out" }).to(
        tunedEl,
        { scale: 1, duration: 0.22, ease: gsapEaseOut },
      );

      if (flareRef.current) {
        gsap.set(flareRef.current, { opacity: 0 });
        tl.to(flareRef.current, { opacity: 1, duration: 0.14, ease: gsapEaseOut }, 0.04).to(
          flareRef.current,
          { opacity: 0, duration: 0.5, ease: gsapEaseOut },
          ">",
        );
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
      <header>
        <div className="hero-grid">
          <div>
            <div className="enter" style={enter(160)}>
              <div className="bar" />
              <div className="eyebrow">Forge · RL with verifiable rewards</div>
            </div>
            <HeadlineReveal as="h1">
              <>
                Teaching a 1.5B model to <i>reason</i> with RL
              </>
            </HeadlineReveal>
            <p className="enter" style={enter(240)}>
              Qwen2.5-1.5B, trained with GRPO (reinforcement learning against a math checker, the
              technique behind DeepSeek-R1) on a single 8GB RTX 5060. Compare the base model and
              the tuned model on the same problem, side by side.
            </p>
            <div className="hero-actions enter" style={enter(320)}>
              <Link className="hero-cta primary" href="/playground">
                {IS_STATIC ? "Try the playground" : "Run it live"}
              </Link>
              <Link className="hero-cta ghost" href="/method">
                How it works
              </Link>
            </div>
          </div>

          <div className="hero-graph enter" style={enter(280)}>
            <div className="hero-graph-label">Training signal · mean group reward</div>
            <svg viewBox="0 0 220 72" fill="none" aria-hidden="true">
              <PathDraw
                d={CURVE_PATH}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                duration={1.6}
              />
              <circle cx="212" cy="6" r="3" fill="var(--terracotta)" />
            </svg>
            <div className="hero-graph-vals">
              <span className="from">1.23</span>
              <span className="sep">to</span>
              <span className="to">
                2.80 <small>of 3.25</small>
              </span>
            </div>
            <p className="hero-graph-caption">
              750 steps x 8 generations. Full curve and every training figure on{" "}
              <Link href="/results">Results</Link>.
            </p>
          </div>
        </div>

        <div className="statbar">
          <div className="stat hero enter" style={enter(380)}>
            <div className="k">GSM8K pass@1</div>
            <div className="v">
              <CountUp value={58.8} decimals={1} suffix="%" /> <span className="arrow">→</span>{" "}
              <CountUp hot value={70.0} decimals={1} suffix="%" />{" "}
              <small className="delta">
                <CountUp value={11.2} decimals={1} prefix="+" suffix=" pts" />
              </small>
            </div>
          </div>
          <div className="stat enter" style={enter(420)}>
            <div className="k">Forgetting (ARC)</div>
            <div className="v">
              <CountUp value={69.5} decimals={1} /> → <CountUp value={68.5} decimals={1} />{" "}
              <small>≈flat</small>
            </div>
          </div>
          <div className="stat enter" style={enter(460)}>
            <div className="k">Rewards</div>
            <div className="v">
              <CountUp value={4} /> <small>verifiable</small>
            </div>
          </div>
          <div className="stat enter" style={enter(500)}>
            <div className="k">Served</div>
            <div className="v">
              <CountUp value={228} /> <small>tok/s</small>
            </div>
          </div>
        </div>
      </header>

      <section>
        <ForgeSecLabel num="01" label="The demo" />
        <h2>
          Pick a <i>problem</i>
        </h2>
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
          Replaying <b>real cached outputs</b> from both models, recorded offline through Ollama
          (Q4_K_M) so this page always works.
        </div>
      </section>

      <section ref={sideRef}>
        <ForgeSecLabel num="02" label="Comparison" />
        <h2>
          The same problem, <i>twice</i>
        </h2>
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
          />
        </div>

        <div className="verdictbar">
          {settled ? (
            <div className={`verdict${strike ? " confirm-stamp" : ""}`}>
              <VerdictChip label="Base" out={active!.models.base} />
              <VerdictChip label="Tuned" out={active!.models.tuned} />
              <span className="gold">gold answer: {active!.gold}</span>
            </div>
          ) : (
            <div className="verdict pending">solving…</div>
          )}
          <div className="tally">
            Base {BASE_WINS}/{EXAMPLES.length} · Tuned {TUNED_WINS}/{EXAMPLES.length} on these
            examples
          </div>
        </div>
      </section>

      <VineRule />

      <section>
        <ForgeSecLabel num="03" label="Go deeper" />
        <h2>
          The rest of the <i>evidence</i>
        </h2>
        {/* Every second card drops at md+ (CSS), so the row reads as grown
            rather than laid out. */}
        <div className="deeper">
          <Link className="deep-card" href="/playground">
            <span className="deep-glow" aria-hidden="true" />
            <span className="deep-k">Playground</span>
            <span className="deep-t">{IS_STATIC ? "Run it yourself" : "Run it yourself, live"}</span>
            <span className="deep-d">
              {IS_STATIC
                ? "Replay both models side by side on six graded problems."
                : "Type any problem. Both models answer side by side on a real GPU, streaming."}
            </span>
            {ARROW}
          </Link>
          <Link className="deep-card" href="/method">
            <span className="deep-glow" aria-hidden="true" />
            <span className="deep-k">Method</span>
            <span className="deep-t">How GRPO actually works</span>
            <span className="deep-d">
              The reward stack, and the bug where every reward was zero so the run learned nothing.
            </span>
            {ARROW}
          </Link>
          <Link className="deep-card" href="/results">
            <span className="deep-glow" aria-hidden="true" />
            <span className="deep-k">Results</span>
            <span className="deep-t">Every number, and its source</span>
            <span className="deep-d">
              Strict vs lenient scoring, the forgetting control, quantization cost, serving latency.
            </span>
            {ARROW}
          </Link>
          <Link className="deep-card" href="/traces">
            <span className="deep-glow" aria-hidden="true" />
            <span className="deep-k">Traces</span>
            <span className="deep-t">Read the reasoning</span>
            <span className="deep-d">
              Unedited completions on held-out problems, including the one both models miss.
            </span>
            {ARROW}
          </Link>
        </div>
      </section>

      <footer>
        Base {BASE_WINS}/{EXAMPLES.length} vs Tuned {TUNED_WINS}/{EXAMPLES.length} on the examples
        above ·{" "}
        <a href="https://github.com/pratyushpad/Forge" target="_blank" rel="noreferrer">
          source &amp; model card on GitHub
        </a>
      </footer>
    </div>
  );
}
