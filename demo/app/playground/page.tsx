"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import examplesData from "../../public/examples.json";
import { cleanAnswer, extractAnswer, StreamError, streamCompletion } from "../../lib/parse";
import ModelColumn, { type Phase } from "../_components/ModelColumn";

type ModelOut = { raw: string; reasoning: string; answer: string | null; correct: boolean };
type Example = { question: string; gold: string; models: { base: ModelOut; tuned: ModelOut } };

const EXAMPLES = (examplesData as { examples: Example[] }).examples;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const findSeed = (q: string) => EXAMPLES.find((e) => norm(e.question) === norm(q)) ?? null;

type Side = { phase: Phase; raw: string; note?: string };
const IDLE: Side = { phase: "idle", raw: "" };

function describeError(err: unknown): string {
  if (err instanceof StreamError) {
    if (err.status === 429) return "Rate limit reached. Wait a minute and try again.";
    if (err.status === 503) return "No live endpoint is configured for this deployment.";
    return err.message;
  }
  return "The live endpoint could not be reached.";
}

export default function Playground() {
  const [question, setQuestion] = useState("");
  const [gold, setGold] = useState<string | null>(null);
  const [base, setBase] = useState<Side>(IDLE);
  const [tuned, setTuned] = useState<Side>(IDLE);
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (q: string) => {
      const problem = q.trim();
      if (!problem || running) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      // Gold answers exist only for the six recorded problems. Anything typed is
      // ungraded — the page shows what each model said and never picks a winner.
      const seed = findSeed(problem);
      setGold(seed?.gold ?? null);
      setBanner(null);
      setRunning(true);
      setBase({ phase: "waking", raw: "" });
      setTuned({ phase: "waking", raw: "" });

      const fallbacks: string[] = [];

      const one = (model: "base" | "tuned", set: (s: Side | ((p: Side) => Side)) => void) =>
        streamCompletion(
          problem,
          model,
          (e) =>
            set((prev) =>
              e.type === "status"
                ? { ...prev, phase: e.status === "streaming" ? "streaming" : "waking" }
                : { phase: "streaming", raw: e.text },
            ),
          ac.signal,
        )
          .then((full) => set({ phase: "done", raw: full }))
          .catch((err) => {
            if (ac.signal.aborted) return;
            const cached = seed?.models[model];
            if (cached) {
              fallbacks.push(model);
              set({
                phase: "cached",
                raw: cached.raw,
                note: "Live endpoint unreachable. Replaying this model's recorded output.",
              });
            } else {
              set({ phase: "error", raw: "", note: describeError(err) });
              setBanner(describeError(err));
            }
          });

      await Promise.all([one("base", setBase), one("tuned", setTuned)]);
      if (!ac.signal.aborted) {
        if (fallbacks.length) {
          setBanner(
            "The GPU endpoint didn't answer, so this problem fell back to the recorded run. Try again in a moment; it scales to zero and may still be waking.",
          );
        }
        setRunning(false);
      }
    },
    [running],
  );

  const settled =
    (base.phase === "done" || base.phase === "cached") &&
    (tuned.phase === "done" || tuned.phase === "cached");

  const baseAns = cleanAnswer(extractAnswer(base.raw));
  const tunedAns = cleanAnswer(extractAnswer(tuned.raw));
  const disagree = settled && !gold && baseAns !== null && tunedAns !== null && baseAns !== tunedAns;
  const agree = settled && !gold && baseAns !== null && tunedAns !== null && baseAns === tunedAns;

  return (
    <div className="wrap">
      <section className="pg-head">
        <div className="sec-label">Playground · live inference</div>
        <h2>Run both models yourself</h2>
        <p className="pg-lede">
          Every request below hits a real GPU: base Qwen2.5-1.5B-Instruct and the GRPO-tuned
          adapter, served side by side from one vLLM process with multi-LoRA. Same prompt, same
          greedy decoding, same one-shot example the model was trained and evaluated with.
        </p>
      </section>

      <section>
        <form
          className="pg-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(question);
          }}
        >
          <label className="pg-label" htmlFor="problem">
            Grade-school math problem
          </label>
          <textarea
            id="problem"
            className="pg-input"
            rows={3}
            maxLength={2000}
            value={question}
            placeholder="e.g. A baker sells 12 loaves on Monday and twice that on Tuesday. If each loaf costs $4, how much did he earn over the two days?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                run(question);
              }
            }}
          />
          <div className="pg-actions">
            <button className="pg-go" type="submit" disabled={running || !question.trim()}>
              {running ? "Forging…" : "Forge it"}
            </button>
            <span className="pg-hint">⌘/Ctrl + Enter · first run can take ~90s while the GPU wakes</span>
          </div>
        </form>

        <div className="pg-seeds">
          <span className="pg-seedlabel">Or run a graded problem:</span>
          {EXAMPLES.map((e, i) => (
            <button
              key={i}
              type="button"
              className="pg-chip"
              disabled={running}
              onClick={() => {
                setQuestion(e.question.trim());
                run(e.question);
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </button>
          ))}
          <span className="pg-seednote">these six have known answers, so they get graded ✓/✗</span>
        </div>

        {banner && (
          <p className="pg-banner" role="status">
            {banner}
          </p>
        )}
      </section>

      <section>
        <div className="grid">
          <ModelColumn kind="base" phase={base.phase} raw={base.raw} gold={gold} note={base.note} />
          <ModelColumn
            kind="tuned"
            phase={tuned.phase}
            raw={tuned.raw}
            gold={gold}
            note={tuned.note}
          />
        </div>

        <div className="verdictbar">
          {settled ? (
            gold ? (
              <div className="verdict">
                <span className="gold">gold answer: {gold}</span>
              </div>
            ) : (
              <div className="verdict">
                <span className={`vchip ${disagree ? "warn" : "neutral"}`}>
                  {disagree
                    ? `models disagree · base ${baseAns} vs tuned ${tunedAns}`
                    : agree
                      ? `models agree · ${baseAns}`
                      : "no gold answer for a typed problem, both outputs shown ungraded"}
                </span>
              </div>
            )
          ) : (
            <div className="verdict pending">{running ? "forging…" : "enter a problem above"}</div>
          )}
          <div className="tally">
            {gold
              ? "graded against the recorded gold answer"
              : "typed problems are ungraded, with no ground truth to check against"}
          </div>
        </div>

        <div className="mode">
          Served by <b>vLLM on Modal</b>, scale-to-zero: the container sleeps after a minute idle,
          so the first request pays a cold start. If the endpoint can&apos;t be reached, the six
          graded problems fall back to their <b>recorded</b> outputs rather than showing nothing.
          <br />
          These are live single runs, so a model can land a problem here that it missed in the
          recorded set on the overview page. The headline{" "}
          <b>58.8% → 70.0%</b> comes from the full 1,319-problem held-out eval, not from anything
          on this page.
        </div>
      </section>
    </div>
  );
}
