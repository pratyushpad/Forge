"use client";

import { useEffect, useRef, useState } from "react";
import examplesData from "../public/examples.json";

type ModelOut = { raw: string; reasoning: string; answer: string | null; correct: boolean };
type Example = { question: string; gold: string; models: { base: ModelOut; tuned: ModelOut } };

const EXAMPLES = (examplesData as { examples: Example[] }).examples;

// Typewriter reveal — gives cached (real) outputs a live-streaming feel and works
// on a static host. Live mode (an actual endpoint) can replace this later.
function useTypewriter() {
  const [text, setText] = useState("");
  const [done, setDone] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const run = (full: string, cps = 320) =>
    new Promise<void>((resolve) => {
      if (timer.current) clearInterval(timer.current);
      setText("");
      setDone(false);
      let i = 0;
      const step = Math.max(1, Math.round(cps / 30));
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
  kind, out, streaming, gold,
}: { kind: "base" | "tuned"; out: ModelOut | null; streaming: { text: string; done: boolean }; gold: string }) {
  const label = kind === "tuned" ? "GRPO-tuned" : "Base";
  const sub = kind === "tuned" ? "Qwen2.5-1.5B + GRPO" : "Qwen2.5-1.5B-Instruct";
  const showAnswer = out && streaming.done;
  return (
    <div className={`col ${kind}`}>
      <h3>
        {label} <span className={`badge ${kind}`}>{sub}</span>
      </h3>
      <div className="sub">reasoning trace</div>
      <div className="reasoning">
        {streaming.text}
        {!streaming.done && <span className="cursor">▋</span>}
      </div>
      <div className="answer">
        <span className="label">answer</span>
        {showAnswer ? (
          <>
            <span className={`val ${out!.correct ? "ok" : "bad"}`}>{out!.answer ?? "—"}</span>
            <span className={`mark ${out!.correct ? "ok" : "bad"}`}>
              {out!.correct ? "✓ correct" : `✗ (gold ${gold})`}
            </span>
          </>
        ) : (
          <span className="val" style={{ color: "var(--muted)" }}>…</span>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [q, setQ] = useState(EXAMPLES[0].question);
  const [active, setActive] = useState<Example | null>(null);
  const [running, setRunning] = useState(false);
  const base = useTypewriter();
  const tuned = useTypewriter();

  const run = async (ex: Example) => {
    setActive(ex);
    setRunning(true);
    await Promise.all([base.run(ex.models.base.reasoning), tuned.run(ex.models.tuned.reasoning)]);
    setRunning(false);
  };

  const onSubmit = () => {
    const match =
      EXAMPLES.find((e) => e.question.trim() === q.trim()) ||
      EXAMPLES.find((e) => e.question.toLowerCase().includes(q.trim().toLowerCase().slice(0, 20)));
    if (match) {
      setQ(match.question);
      run(match);
    }
  };

  useEffect(() => {
    run(EXAMPLES[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wrap">
      <header>
        <h1>
          Forge — teaching a 1.5B model to reason with <span className="tag">GRPO</span>
        </h1>
        <p>
          Qwen2.5-1.5B trained with reinforcement learning (verifiable rewards, the DeepSeek-R1
          technique) on a single 8GB RTX 5060. Watch the base model and the GRPO-tuned model solve
          the same problem, side by side.
        </p>
      </header>

      <div className="statbar">
        <div className="stat"><div className="k">GSM8K pass@1</div><div className="v">58.8% → 70.0%</div></div>
        <div className="stat"><div className="k">Forgetting (ARC)</div><div className="v">69.5 → 68.5 <small>≈flat</small></div></div>
        <div className="stat"><div className="k">Train time</div><div className="v">86 min <small>3.64 GiB</small></div></div>
        <div className="stat"><div className="k">Served</div><div className="v">228 <small>tok/s</small></div></div>
      </div>

      <div className="controls">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !running && onSubmit()}
          placeholder="Pick an example below, or type a problem…"
        />
        <button onClick={onSubmit} disabled={running}>
          {running ? "Solving…" : "Compare"}
        </button>
      </div>
      <div className="mode">
        Showing <b>real cached outputs</b> from both models (generated offline so this page always
        works). Point <code>FORGE_FALLBACK_URL</code> at a live endpoint for on-the-fly inference.
      </div>

      <div className="examples">
        {EXAMPLES.map((e, i) => (
          <button key={i} className="chip" onClick={() => { setQ(e.question); run(e); }}>
            {e.question.length > 52 ? e.question.slice(0, 52).trim() + "…" : e.question}
          </button>
        ))}
      </div>

      <div className="grid">
        <ModelColumn kind="base" out={active?.models.base ?? null} streaming={base} gold={active?.gold ?? ""} />
        <ModelColumn kind="tuned" out={active?.models.tuned ?? null} streaming={tuned} gold={active?.gold ?? ""} />
      </div>

      <div className="results">
        <h2>The proof</h2>
        <div className="resgrid">
          <div className="card">
            <h4>GSM8K pass@1 (1,319 held-out problems)</h4>
            <div className="bar-row">
              <span className="name">Base</span>
              <div className="bar-track"><div className="bar-fill base" style={{ width: "58.8%" }}>58.8%</div></div>
            </div>
            <div className="bar-row">
              <span className="name">GRPO-tuned</span>
              <div className="bar-track"><div className="bar-fill tuned" style={{ width: "70%" }}>70.0%</div></div>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 14 }}>
              +11.2 points from RL alone — no supervised fine-tuning, no human labels, just a math
              checker as the reward.
            </p>
          </div>
          <div className="card">
            <h4>Reward climbing during training (750 steps)</h4>
            <img className="curve" src="/reward_curve.png" alt="GRPO reward curve" />
          </div>
        </div>
      </div>

      <footer>
        Base 1/6 vs GRPO-tuned 5/6 on the examples above ·{" "}
        <a href="https://github.com/pratyushpad/forge" target="_blank" rel="noreferrer">
          source &amp; model card on GitHub
        </a>
      </footer>
    </div>
  );
}
