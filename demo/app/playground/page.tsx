"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import examplesData from "../../public/examples.json";
import {
  answersMatch,
  cleanAnswer,
  extractAnswer,
  StreamError,
  streamCompletion,
} from "../../lib/parse";
import ModelColumn, { type Phase } from "../_components/ModelColumn";
import ForgeSecLabel from "../_components/ForgeSecLabel";
import TextIgnite from "../_components/motion/TextIgnite";
import { gsap, useGSAP } from "../../lib/gsap";
import { gsapEaseInOut, gsapEaseOut, prefersReducedMotion } from "../../lib/motion";

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
  const [strike, setStrike] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sideRef = useRef<HTMLDivElement | null>(null);
  const tunedColRef = useRef<HTMLDivElement | null>(null);
  const flareRef = useRef<HTMLSpanElement | null>(null);
  const sparksRef = useRef<HTMLSpanElement | null>(null);

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
      setStrike(false);
      setBase({ phase: "waking", raw: "" });
      setTuned({ phase: "waking", raw: "" });

      const fallbacks: string[] = [];

      // Returns the settled raw text (or null on an ungraded error) so `run`
      // can decide the strike off the actual resolved value instead of
      // re-reading React state that may not have committed yet.
      const one = (
        model: "base" | "tuned",
        set: (s: Side | ((p: Side) => Side)) => void,
      ): Promise<string | null> =>
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
          .then((full) => {
            set({ phase: "done", raw: full });
            return full;
          })
          .catch((err) => {
            if (ac.signal.aborted) return null;
            const cached = seed?.models[model];
            if (cached) {
              fallbacks.push(model);
              set({
                phase: "cached",
                raw: cached.raw,
                note: "Live endpoint unreachable. Replaying this model's recorded output.",
              });
              return cached.raw;
            }
            set({ phase: "error", raw: "", note: describeError(err) });
            setBanner(describeError(err));
            return null;
          });

      const [, tunedRaw] = await Promise.all([one("base", setBase), one("tuned", setTuned)]);
      if (!ac.signal.aborted) {
        if (fallbacks.length) {
          setBanner(
            "The GPU endpoint didn't answer, so this problem fell back to the recorded run. Try again in a moment; it scales to zero and may still be waking.",
          );
        }
        setRunning(false);
        // Only a graded problem with a genuinely correct tuned answer earns the
        // strike — no theater over an ungraded or wrong result.
        if (seed?.gold && tunedRaw && answersMatch(extractAnswer(tunedRaw), seed.gold)) {
          setStrike(true);
        }
      }
    },
    [running],
  );

  // The strike — same hammer-pulse + flare + spark burst as the home page
  // §02 columns, event-driven off `strike`.
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
        <ForgeSecLabel num="00" label="Playground · live inference" />
        <TextIgnite as="h2" igniteWord="Run">
          Run both models yourself
        </TextIgnite>
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

      <section ref={sideRef}>
        <ForgeSecLabel num="01" label="Side by side, live" />
        <div className="grid">
          <ModelColumn kind="base" phase={base.phase} raw={base.raw} gold={gold} note={base.note} />
          <ModelColumn
            kind="tuned"
            phase={tuned.phase}
            raw={tuned.raw}
            gold={gold}
            note={tuned.note}
            colRef={tunedColRef}
            flareRef={flareRef}
            sparksRef={sparksRef}
          />
        </div>

        <div className="verdictbar">
          {settled ? (
            gold ? (
              <div className={`verdict${strike ? " forge-stamp" : ""}`}>
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
