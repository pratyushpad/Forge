// Live-mode inference proxy (optional). Streams from an OpenAI-compatible endpoint
// configured via env, so the demo can run real inference when a box/host is up.
// Falls back with 503 when nothing is configured — the page then uses cached outputs.
export const runtime = "edge";

const SYSTEM =
  "Respond in the following format:\n<reasoning>\n...\n</reasoning>\n<answer>\n...\n</answer>\n\n" +
  "The <answer> block must contain only the final numeric answer.";

// Verbatim ONE_SHOT from data/gsm8k.py. Not optional: with the system prompt
// alone both models ignore the format and answer free-form (measured 0/80 tagged
// completions in training, and confirmed against this endpoint). Live inference
// must use the exact prompt the eval harness used, or the comparison is dishonest.
const ONE_SHOT = [
  { role: "user", content: "What is 2 + 3?" },
  { role: "assistant", content: "<reasoning>\n2 + 3 = 5.\n</reasoning>\n<answer>\n5\n</answer>" },
] as const;

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Fixed-window in-memory rate limit, per edge isolate — enough to blunt casual
// abuse of the proxy once a live endpoint is set. If live mode ever sees real
// traffic, replace with a KV-backed limiter or require a shared secret.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

// Budget for a cold start (GPU sleeps after 60s idle, wakes in ~30-90s) plus the
// generation itself; heartbeats keep the connection open in the meantime.
const UPSTREAM_TIMEOUT_MS = 150_000;
const HEARTBEAT_MS = 2_000;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 1024) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  const h = hits.get(ip);
  if (!h || now > h.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  return ++h.count > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return json({ error: "rate limit exceeded" }, 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const { question, model } = (body ?? {}) as { question?: unknown; model?: unknown };
  if (typeof question !== "string" || !question.trim() || question.length > 2000) {
    return json({ error: "question must be a non-empty string (max 2000 chars)" }, 400);
  }

  const base = process.env.FORGE_FALLBACK_URL || process.env.FORGE_VLLM_URL;
  if (!base) return json({ error: "no live endpoint configured" }, 503);

  // Clamp model to known names — never forward an arbitrary user string upstream.
  // "base" / "tuned" are the multi-LoRA ids the Modal vLLM server registers.
  const allowed = new Set(
    ["forge", "base", "tuned", process.env.FORGE_FALLBACK_MODEL].filter(Boolean),
  );
  const chosen =
    typeof model === "string" && allowed.has(model)
      ? model
      : process.env.FORGE_FALLBACK_MODEL || "forge";

  const enc = new TextEncoder();
  const sse = (obj: object) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);

  const call = () =>
    fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        ...(process.env.FORGE_FALLBACK_KEY
          ? { authorization: `Bearer ${process.env.FORGE_FALLBACK_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: chosen,
        messages: [
          { role: "system", content: SYSTEM },
          ...ONE_SHOT,
          { role: "user", content: question },
        ],
        temperature: 0,
        max_tokens: 768,
        stream: true,
      }),
    });

  // The endpoint scales to zero, so a request can sit behind a ~30-90s cold start.
  // The edge runtime wants an initial response long before that, so open the stream
  // immediately and heartbeat while upstream wakes. Consequence: once the stream is
  // open the status is committed to 200, so post-open failures are reported in-band
  // as {forge_error}. Pre-flight failures (no endpoint) still return a real 503.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          /* client already gone */
        }
      };
      send(sse({ forge_status: "waking" }));
      const beat = setInterval(() => send(enc.encode(": keep-alive\n\n")), HEARTBEAT_MS);

      (async () => {
        try {
          const upstream = await call();
          if (!upstream.ok || !upstream.body) {
            send(sse({ forge_error: `upstream ${upstream.status}` }));
            return;
          }
          clearInterval(beat);
          send(sse({ forge_status: "streaming" }));
          const reader = upstream.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            send(value);
          }
        } catch {
          send(sse({ forge_error: "endpoint unreachable" }));
        } finally {
          clearInterval(beat);
          clearTimeout(timeout);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      })();
    },
    cancel() {
      clearTimeout(timeout);
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
