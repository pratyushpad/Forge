"""fp16 merged-model pass@1 on a GSM8K test subset via vLLM (GPU).

The fp16 side of the quant-delta table. Same prompts/greedy as eval_served so the
Q4 (llama.cpp) vs fp16 (vLLM) pass@1 comparison isolates quantization quality.

Usage: python -m eval.eval_fp16_vllm --limit 100
"""

import argparse
import json
import time
from pathlib import Path

from vllm import LLM, SamplingParams

from data.gsm8k import load_gsm8k
from train.rewards import answers_match, extract_answer


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="export/merged_16bit")
    p.add_argument("--limit", type=int, default=100)
    args = p.parse_args()

    ds = load_gsm8k("test").select(range(args.limit))
    prompts = [row["prompt"] for row in ds]
    golds = [row["answer"] for row in ds]

    llm = LLM(model=args.model, dtype="float16", max_model_len=1024,
              gpu_memory_utilization=0.7, seed=3407)
    sp = SamplingParams(temperature=0.0, max_tokens=768)

    t0 = time.time()
    outs = llm.chat(prompts, sp)
    dt = time.time() - t0

    texts = [o.outputs[0].text for o in outs]
    n_out = sum(len(o.outputs[0].token_ids) for o in outs)
    correct = sum(answers_match(extract_answer(t), g) for t, g in zip(texts, golds))

    result = {
        "label": "fp16_merged",
        "backend": "vLLM GPU (RTX 5060)",
        "n": len(ds),
        "pass@1": round(correct / len(ds), 4),
        "gen_tok_per_s": round(n_out / dt, 1),
        "completion_tokens": n_out,
        "wall_s": round(dt, 1),
    }
    Path("eval/results").mkdir(parents=True, exist_ok=True)
    with open("eval/results/served_fp16_merged.json", "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
