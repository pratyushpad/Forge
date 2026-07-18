"""Measure serving throughput against any OpenAI-compatible endpoint.

Reports time-to-first-token (TTFT) and decode throughput (tok/s) from real
streamed responses — the two numbers that matter for interactive serving.

Usage: python -m serve.bench --base-url http://127.0.0.1:8000/v1 --model forge-fp16
"""

import argparse
import json
import time

import requests

PROMPTS = [
    "Natalia sold clips to 48 friends in April, then half as many in May. How many total?",
    "A robe takes 2 bolts of blue fiber and half that much white. How many bolts total?",
    "Weng earns $12/hour babysitting. Yesterday she did 50 minutes. How much did she earn?",
]
SYS = (
    "Respond in the following format:\n<reasoning>\n...\n</reasoning>\n"
    "<answer>\n...\n</answer>\n\nThe <answer> block must contain only the final numeric answer."
)


def stream_once(base_url: str, model: str, user: str, max_tokens: int):
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": user}],
        "temperature": 0.0,
        "max_tokens": max_tokens,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    t0 = time.time()
    ttft = None
    n_tokens = 0
    with requests.post(f"{base_url}/chat/completions", json=payload, stream=True, timeout=600) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line or not line.startswith(b"data: "):
                continue
            data = line[6:]
            if data == b"[DONE]":
                break
            chunk = json.loads(data)
            choices = chunk.get("choices") or []
            if choices and choices[0].get("delta", {}).get("content"):
                if ttft is None:
                    ttft = time.time() - t0
                n_tokens += 1
    total = time.time() - t0
    decode_s = max(total - (ttft or 0), 1e-6)
    return ttft, n_tokens, n_tokens / decode_s


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://127.0.0.1:8000/v1")
    p.add_argument("--model", default="forge-fp16")
    p.add_argument("--label", default="vllm-fp16")
    p.add_argument("--max-tokens", type=int, default=256)
    args = p.parse_args()

    # warmup
    stream_once(args.base_url, args.model, "What is 2+2?", 16)

    ttfts, tpss = [], []
    for prompt in PROMPTS:
        ttft, n, tps = stream_once(args.base_url, args.model, prompt, args.max_tokens)
        ttfts.append(ttft)
        tpss.append(tps)
        print(f"  ttft={ttft*1000:.0f}ms  decode={tps:.1f} tok/s  ({n} tok)")

    result = {
        "label": args.label,
        "base_url": args.base_url,
        "ttft_ms_mean": round(sum(ttfts) / len(ttfts) * 1000, 1),
        "decode_tok_per_s_mean": round(sum(tpss) / len(tpss), 1),
        "n_prompts": len(PROMPTS),
    }
    from pathlib import Path
    Path("eval/results").mkdir(parents=True, exist_ok=True)
    with open(f"eval/results/serve_{args.label}.json", "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
