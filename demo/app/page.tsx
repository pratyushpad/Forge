"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import examplesData from "../public/examples.json";
import { prefersReducedMotion, replayDuration } from "../lib/motion";

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

const enter = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

export default function Home() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [active, setActive] = useState<Example | null>(null);
  const [running, setRunning] = useState(false);
  const base = useTypewriter();
  const tuned = useTypewriter();

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
        <div className="hero-inner">
          <div className="enter" style={enter(0)}>
            <div className="bar" />
            <div className="eyebrow">Forge · RL with verifiable rewards</div>
          </div>
          <h1 className="enter" style={enter(60)}>
            Forged to <span className="hot">reason</span>
          </h1>
          <p className="enter" style={enter(140)}>
            Qwen2.5-1.5B, heat-treated with GRPO — reinforcement learning against a math checker,
            the DeepSeek-R1 technique — on a single 8GB RTX 5060. Watch the cold base model and the
            forged model solve the same problem, side by side.
          </p>
        </div>

        <div className="statbar">
          <div className="stat hero enter" style={enter(220)}>
            <div className="k">GSM8K pass@1</div>
            <div className="v">
              58.8% <span className="arrow">→</span> <span className="hot">70.0%</span>{" "}
              <small className="delta">+11.2 pts</small>
            </div>
          </div>
          <div className="stat enter" style={enter(280)}>
            <div className="k">Forgetting (ARC)</div>
            <div className="v">
              69.5 → 68.5 <small>≈flat</small>
            </div>
          </div>
          <div className="stat enter" style={enter(340)}>
            <div className="k">Train time</div>
            <div className="v">
              86 min <small>3.64 GiB</small>
            </div>
          </div>
          <div className="stat enter" style={enter(400)}>
            <div className="k">Served</div>
            <div className="v">
              228 <small>tok/s</small>
            </div>
          </div>
        </div>
      </header>

      <section>
        <div className="sec-label">01 · Pick a problem</div>
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

      <section>
        <div className="sec-label">02 · Side by side</div>
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
          />
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
      </section>

      <section>
        <div className="sec-label">03 · Go deeper</div>
        <h2>The rest of the evidence</h2>
        <div className="deeper">
          <Link className="deep-card" href="/playground">
            <span className="deep-k">Playground</span>
            <span className="deep-t">Run it yourself, live</span>
            <span className="deep-d">
              Type any problem. Both models answer side by side on a real GPU, streaming.
            </span>
          </Link>
          <Link className="deep-card" href="/method">
            <span className="deep-k">Method</span>
            <span className="deep-t">How GRPO actually works</span>
            <span className="deep-d">
              The reward stack, and the bug where every reward was zero so the run learned nothing.
            </span>
          </Link>
          <Link className="deep-card" href="/results">
            <span className="deep-k">Results</span>
            <span className="deep-t">Every number, and its source</span>
            <span className="deep-d">
              Strict vs lenient scoring, the forgetting control, quantization cost, serving latency.
            </span>
          </Link>
          <Link className="deep-card" href="/traces">
            <span className="deep-k">Traces</span>
            <span className="deep-t">Read the reasoning</span>
            <span className="deep-d">
              Unedited completions on held-out problems — including the one both models miss.
            </span>
          </Link>
        </div>
      </section>

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
