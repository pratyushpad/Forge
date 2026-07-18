// Live-mode inference proxy (optional). Streams from an OpenAI-compatible endpoint
// configured via env, so the demo can run real inference when a box/host is up.
// Falls back with 503 when nothing is configured — the page then uses cached outputs.
export const runtime = "edge";

const SYSTEM =
  "Respond in the following format:\n<reasoning>\n...\n</reasoning>\n<answer>\n...\n</answer>\n\n" +
  "The <answer> block must contain only the final numeric answer.";

export async function POST(req: Request) {
  const { question, model } = await req.json();
  const base = process.env.FORGE_FALLBACK_URL || process.env.FORGE_VLLM_URL;
  if (!base) {
    return new Response(JSON.stringify({ error: "no live endpoint configured" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.FORGE_FALLBACK_KEY ? { authorization: `Bearer ${process.env.FORGE_FALLBACK_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: model || process.env.FORGE_FALLBACK_MODEL || "forge",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: question },
      ],
      temperature: 0,
      max_tokens: 512,
      stream: true,
    }),
  });
  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
