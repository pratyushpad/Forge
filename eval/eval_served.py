"""Eval a served OpenAI-compatible endpoint on a GSM8K test subset.

Backend-agnostic: works against llama-server (GGUF), vLLM, or Ollama's OpenAI
shim. Sends the same {prompt, answer} rows, greedy, and scores <answer> exact
match. Records server-reported throughput if present, else measures wall tok/s.

Usage: python -m eval.eval_served --base-url http://127.0.0.1:8080/v1 \
           --label q4_k_m --limit 100
"""

import argparse
import json
import time
from pathlib import Path

import requests

from data.gsm8k import load_gsm8k
from train.rewards import answers_match, extract_answer


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://127.0.0.1:8080/v1")
    p.add_argument("--model", default="forge")
    p.add_argument("--label", required=True)
    p.add_argument("--limit", type=int, default=100)
    p.add_argument("--max-tokens", type=int, default=768)
    args = p.parse_args()

    ds = load_gsm8k("test").select(range(args.limit))
    correct, out_tokens, gen_time = 0, 0, 0.0
    t0 = time.time()

    for i, row in enumerate(ds):
        payload = {
            "model": args.model,
            "messages": row["prompt"],
            "temperature": 0.0,
            "max_tokens": args.max_tokens,
        }
        t1 = time.time()
        r = requests.post(f"{args.base_url}/chat/completions", json=payload, timeout=600)
        gen_time += time.time() - t1
        r.raise_for_status()
        data = r.json()
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage") or {}
        out_tokens += usage.get("completion_tokens", 0)
        if answers_match(extract_answer(text), row["answer"]):
            correct += 1
        if (i + 1) % 20 == 0:
            print(f"  {i+1}/{len(ds)}  acc={correct/(i+1):.3f}")

    result = {
        "label": args.label,
        "base_url": args.base_url,
        "n": len(ds),
        "pass@1": round(correct / len(ds), 4),
        "gen_tok_per_s": round(out_tokens / gen_time, 1) if gen_time and out_tokens else None,
        "completion_tokens": out_tokens,
        "wall_s": round(time.time() - t0, 1),
    }
    Path("eval/results").mkdir(parents=True, exist_ok=True)
    with open(f"eval/results/served_{args.label}.json", "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
