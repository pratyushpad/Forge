"use client";

import { useEffect, useRef } from "react";
import { answersMatch, cleanAnswer, extractAnswer, extractReasoning } from "../../lib/parse";

export type Phase = "idle" | "waking" | "streaming" | "done" | "cached" | "error";

const STATUS: Record<Phase, string | null> = {
  idle: null,
  waking: "stoking the forge · waking the GPU",
  streaming: "generating",
  done: "live",
  cached: "cached replay",
  error: "unavailable",
};

export default function ModelColumn({
  kind,
  phase,
  raw,
  gold,
  note,
}: {
  kind: "base" | "tuned";
  phase: Phase;
  raw: string;
  /** Gold answer, when one is known (seed problems only). Null ⇒ render ungraded. */
  gold: string | null;
  note?: string;
}) {
  const label = kind === "tuned" ? "GRPO-tuned" : "Base";
  const sub = kind === "tuned" ? "Qwen2.5-1.5B + GRPO" : "Qwen2.5-1.5B-Instruct";
  const paneRef = useRef<HTMLDivElement | null>(null);

  const reasoning = extractReasoning(raw);
  const answer = extractAnswer(raw);
  const clean = cleanAnswer(answer);
  const settled = phase === "done" || phase === "cached";
  // Graded only where a gold answer exists. On a typed problem there is no ground
  // truth, so the column reports what the model said and nothing more.
  const correct = settled && gold ? answersMatch(answer, gold) : null;
  const live = phase === "waking" || phase === "streaming";

  // Follow the stream, but only when already near the bottom — scrolling up to
  // read must not get yanked back down.
  useEffect(() => {
    const el = paneRef.current;
    if (!el || !live) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 64) el.scrollTop = el.scrollHeight;
  }, [raw, live]);

  const status = STATUS[phase];

  return (
    <div className={`col ${kind}`}>
      <h3>
        {label} <span className={`badge ${kind}`}>{sub}</span>
      </h3>

      <div className="sub sub-row">
        <span>reasoning trace</span>
        {status && (
          <span className={`livetag ${phase}`}>
            {live && <span className="livedot" aria-hidden="true" />}
            {status}
          </span>
        )}
      </div>

      <div
        className="reasoning"
        ref={paneRef}
        aria-live="polite"
        aria-busy={live}
        aria-label={`${label} reasoning trace`}
      >
        {reasoning || (phase === "idle" ? <span className="muted">waiting for a problem…</span> : "")}
        {phase === "streaming" && <span className="cursor">▋</span>}
        {phase === "waking" && <span className="muted">waking the GPU, first run can take ~90s…</span>}
      </div>

      {note && <p className="colnote">{note}</p>}

      <div className="answer">
        <span className="label">answer</span>
        {settled ? (
          <>
            <span
              className={`val reveal ${correct === null ? "" : correct ? "ok" : "bad"}`}
            >
              {clean ?? "—"}
            </span>
            {correct === null ? (
              <span className="mark reveal neutral">
                {clean ? "ungraded · no gold answer" : "no clear answer"}
              </span>
            ) : (
              <span className={`mark reveal ${correct ? "ok" : "bad"}`}>
                {correct
                  ? "✓ correct"
                  : clean
                    ? `✗ wrong · gold ${gold}`
                    : `✗ no clear answer · gold ${gold}`}
              </span>
            )}
          </>
        ) : (
          // No placeholder glyph — but the row still reserves its height so the
          // column doesn't jump when the real answer lands.
          <span className="val pending" aria-hidden="true">
            &nbsp;
          </span>
        )}
      </div>
    </div>
  );
}
