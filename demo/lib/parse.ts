// Client-side mirror of the training/eval contract. The parsing and grading here
// are deliberate ports of train/rewards.py (extract_answer / normalize_number /
// answers_match) so a live run on a seed problem is graded exactly the way the
// reported eval numbers were — no second, looser standard for the demo.

const ANSWER_RE = /<answer>\s*([\s\S]*?)\s*<\/answer>/g;

/** Contents of the LAST <answer> block, or null. Mirrors rewards.extract_answer. */
export function extractAnswer(text: string): string | null {
  const matches = [...text.matchAll(ANSWER_RE)];
  return matches.length ? matches[matches.length - 1][1].trim() : null;
}

/** Reasoning body. Tolerates a half-streamed block so the pane fills as tokens land. */
export function extractReasoning(text: string): string {
  const m = text.match(/<reasoning>([\s\S]*?)(?:<\/reasoning>|$)/);
  return (m ? m[1] : text).trim();
}

/** '$1,234.50' -> 1234.5; '72' -> 72; non-numeric -> null. Mirrors normalize_number. */
export function normalizeNumber(s: string): number | null {
  const cleaned = s.trim().replace(/,/g, "").replace(/\$/g, "").replace(/%+$/, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Mirrors rewards.answers_match: numeric equality when both parse, else exact string. */
export function answersMatch(predicted: string | null, gold: string): boolean {
  if (predicted === null) return false;
  const p = normalizeNumber(predicted);
  const g = normalizeNumber(gold);
  if (p !== null && g !== null) return p === g;
  return predicted.trim() === gold.trim();
}

// Only render an answer verbatim when it's a clean numeric value — the base model
// sometimes emits an expression or nothing parseable. Those show as "no clear
// answer" rather than a raw string. (Same rule as the cached view on the home page.)
export const cleanAnswer = (a: string | null): string | null =>
  a && /^[$-]?[\d.,]+%?$/.test(a.trim()) ? a.trim() : null;

export type StreamEvent =
  | { type: "status"; status: "waking" | "streaming" }
  | { type: "token"; text: string };

export class StreamError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "StreamError";
    this.status = status;
  }
}

/**
 * POST to the proxy and stream the reply, calling `onEvent` with the accumulated
 * text on every token. Resolves with the full raw completion.
 *
 * The proxy speaks OpenAI SSE plus two in-band control frames: {forge_status} while
 * the scaled-to-zero GPU wakes, and {forge_error} for a failure that happens after
 * the stream is already committed to a 200.
 */
export async function streamCompletion(
  question: string,
  model: "base" | "tuned",
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, model }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new StreamError(message, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the trailing partial line
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue; // blank or keep-alive comment
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;

      let frame: {
        forge_error?: string;
        forge_status?: string;
        choices?: { delta?: { content?: string } }[];
      };
      try {
        frame = JSON.parse(payload);
      } catch {
        continue; // partial or unrecognised frame
      }

      if (typeof frame.forge_error === "string") throw new StreamError(frame.forge_error);
      if (frame.forge_status === "waking" || frame.forge_status === "streaming") {
        onEvent({ type: "status", status: frame.forge_status });
        continue;
      }
      const delta = frame.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        full += delta;
        onEvent({ type: "token", text: full });
      }
    }
  }

  return full;
}
