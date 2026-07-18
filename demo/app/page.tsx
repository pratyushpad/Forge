"use client";

import { useEffect, useRef, useState } from "react";
import examplesData from "../public/examples.json";

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

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Replay duration derived from each output's real measured latency_s, slowed to
// reading speed. Floored/capped by text length so pacing stays readable, and
// latency clamped positive (one cached value is negative from clock skew).
function replayDuration(out: ModelOut): number {
  const len = out.reasoning.length;
  const lat = Math.max(0.4, out.latency_s ?? 0);
  let ms = lat * 3500;
  ms = Math.max(ms, (len / 260) * 1000);
  ms = Math.min(ms, (len / 70) * 1000);
  return Math.min(6000, Math.max(1200, ms));
}

// Typewriter reveal — gives cached (real) outputs a live-streaming feel and works
// on a static host. Renders instantly under prefers-reduced-motion.
function useTypewriter() {
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

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setInView(true), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

function ModelColumn({
  kind,
  out,
  streaming,
  gold,
}: {
  kind: "base" | "tuned";
  out: ModelOut | null;
  streaming: { text: string; done: boolean };
  gold: string;
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
    <div className={`col ${kind}`}>
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
          <span className="val pending">…</span>
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

function Bar({
  name,
  value,
  label,
  tuned,
  show,
}: {
  name: string;
  value: number;
  label: string;
  tuned?: boolean;
  show: boolean;
}) {
  return (
    <div className="bar-row">
      <span className="name">{name}</span>
      <div className="bar-track">
        <div
          className={`bar-fill ${tuned ? "tuned" : "base"}`}
          style={{ width: show ? `${value}%` : "0%" }}
        />
      </div>
      <span className="bar-val">{label}</span>
    </div>
  );
}

export default function Home() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [active, setActive] = useState<Example | null>(null);
  const [running, setRunning] = useState(false);
  const base = useTypewriter();
  const tuned = useTypewriter();
  const results = useInView<HTMLDivElement>();

  const run = async (i: number) => {
    const ex = EXAMPLES[i];
    setActiveIdx(i);
    setActive(ex);
    setRunning(true);
    await Promise.all([
      base.run(ex.models.base.reasoning, replayDuration(ex.models.base)),
      tuned.run(ex.models.tuned.reasoning, replayDuration(ex.models.tuned)),
    ]);
    setRunning(false);
  };

  useEffect(() => {
    run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settled = active && base.done && tuned.done && !running;

  return (
    <div className="wrap">
      <header>
        <div className="ghost" aria-hidden="true">
          GRPO
        </div>
        <div className="bar" />
        <div className="eyebrow">Forge — RL with verifiable rewards</div>
        <h1>
          Teaching a 1.5B model to reason with <span className="tag">GRPO</span>
        </h1>
        <p>
          Qwen2.5-1.5B trained with reinforcement learning (verifiable rewards, the DeepSeek-R1
          technique) on a single 8GB RTX 5060. Watch the base model and the GRPO-tuned model solve
          the same problem, side by side.
        </p>
      </header>

      <div className="statbar">
        <div className="stat hero">
          <div className="k">GSM8K pass@1</div>
          <div className="v">
            58.8% <span className="arrow">→</span> 70.0% <small className="delta">+11.2 pts</small>
          </div>
        </div>
        <div className="stat"><div className="k">Forgetting (ARC)</div><div className="v">69.5 → 68.5 <small>≈flat</small></div></div>
        <div className="stat"><div className="k">Train time</div><div className="v">86 min <small>3.64 GiB</small></div></div>
        <div className="stat"><div className="k">Served</div><div className="v">228 <small>tok/s</small></div></div>
      </div>

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
              {i === activeIdx && <span className="ex-replay">{running ? "solving…" : "↻ replay"}</span>}
            </span>
          </button>
        ))}
      </div>
      <div className="mode">
        Replaying <b>real cached outputs</b> from both models (generated offline so this page always
        works). Point <code>FORGE_FALLBACK_URL</code> at a live endpoint for on-the-fly inference.
      </div>

      <div className="grid">
        <ModelColumn kind="base" out={active?.models.base ?? null} streaming={base} gold={active?.gold ?? ""} />
        <ModelColumn kind="tuned" out={active?.models.tuned ?? null} streaming={tuned} gold={active?.gold ?? ""} />
      </div>

      <div className="verdictbar">
        {settled ? (
          <div className="verdict">
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

      <div className="results" ref={results.ref}>
        <div className="bar" />
        <h2>The proof</h2>
        <div className="resgrid">
          <div className="card">
            <h4>GSM8K pass@1 (1,319 held-out problems)</h4>
            <Bar name="Base" value={58.8} label="58.8%" show={results.inView} />
            <Bar name="GRPO-tuned" value={70} label="70.0%" tuned show={results.inView} />
            <p className="caption">
              +11.2 points from RL alone — no supervised fine-tuning, no human labels, just a math
              checker as the reward.
            </p>
          </div>
          <div className="card">
            <h4>Forgetting check — ARC-Challenge (200 questions)</h4>
            <Bar name="Base" value={69.5} label="69.5%" show={results.inView} />
            <Bar name="GRPO-tuned" value={68.5} label="68.5%" tuned show={results.inView} />
            <p className="caption">
              −1.0 pt, within noise — math RL did not degrade general reasoning.
            </p>
          </div>
          <div className="card span">
            <h4>Reward climbing during training (750 steps)</h4>
            <img className="curve" src="/reward_curve.png" alt="GRPO reward curve" />
            <p className="caption">Mean group reward 1.23 → 2.80 (of 3.25) over 750 steps.</p>
          </div>
        </div>
      </div>

      <footer>
        Base {BASE_WINS}/{EXAMPLES.length} vs GRPO-tuned {TUNED_WINS}/{EXAMPLES.length} on the
        examples above ·{" "}
        <a href="https://github.com/pratyushpad/forge" target="_blank" rel="noreferrer">
          source &amp; model card on GitHub
        </a>
      </footer>
    </div>
  );
}
