// Live-mode inference proxy (optional). Streams from an OpenAI-compatible endpoint
// configured via env, so the demo can run real inference when a box/host is up.
// Falls back with 503 when nothing is configured — the page then uses cached outputs.
export const runtime = "edge";

const SYSTEM =
  "Respond in the following format:\n<reasoning>\n...\n</reasoning>\n<answer>\n...\n</answer>\n\n" +
  "The <answer> block must contain only the final numeric answer.";

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Fixed-window in-memory rate limit, per edge isolate — enough to blunt casual
// abuse of the proxy once a live endpoint is set. If live mode ever sees real
// traffic, replace with a KV-backed limiter or require a shared secret.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
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
  const allowed = new Set(["forge", process.env.FORGE_FALLBACK_MODEL].filter(Boolean));
  const chosen =
    typeof model === "string" && allowed.has(model)
      ? model
      : process.env.FORGE_FALLBACK_MODEL || "forge";

  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.FORGE_FALLBACK_KEY ? { authorization: `Bearer ${process.env.FORGE_FALLBACK_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: chosen,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: question },
      ],
      temperature: 0,
      max_tokens: 512,
      stream: true,
    }),
  });
  if (!upstream.ok || !upstream.body) return json({ error: "upstream error" }, 502);
  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
