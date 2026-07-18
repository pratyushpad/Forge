"""GSM8K held-out eval: base vs GRPO-tuned pass@1 (greedy), same prompt pipeline.

Both models get the identical one-shot prompt. Two scoring modes:
  strict:  answer parsed from <answer> tags only (the trained contract)
  lenient: falls back to the last number in the text (fair to the base model,
           which doesn't reliably follow the tag format)

Usage: python -m eval.eval_gsm8k [--adapter outputs/full] [--limit N]
Writes eval/results/gsm8k.json and docs/sample_traces.md.
"""

import argparse
import json
import re
from pathlib import Path

from vllm import LLM, SamplingParams
from vllm.lora.request import LoRARequest

from data.gsm8k import load_gsm8k
from train.rewards import answers_match, extract_answer

MODEL = "unsloth/qwen2.5-1.5b-instruct-unsloth-bnb-4bit"  # same weights as training
NUM_RE = re.compile(r"-?\$?\d[\d,]*\.?\d*")


def lenient_extract(text: str) -> str | None:
    tagged = extract_answer(text)
    if tagged is not None:
        return tagged
    nums = NUM_RE.findall(text)
    return nums[-1] if nums else None


def score(outputs, golds) -> dict:
    strict = sum(answers_match(extract_answer(o), g) for o, g in zip(outputs, golds))
    lenient = sum(answers_match(lenient_extract(o), g) for o, g in zip(outputs, golds))
    n = len(golds)
    return {"n": n, "strict": strict / n, "lenient": lenient / n}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--adapter", default="outputs/full")
    p.add_argument("--limit", type=int, default=0, help="0 = full test set")
    p.add_argument("--traces", type=int, default=5)
    args = p.parse_args()

    ds = load_gsm8k("test")
    if args.limit:
        ds = ds.select(range(args.limit))
    prompts = [row["prompt"] for row in ds]
    golds = [row["answer"] for row in ds]

    llm = LLM(
        model=MODEL,
        quantization="bitsandbytes",
        load_format="bitsandbytes",
        max_model_len=1024,
        gpu_memory_utilization=0.65,
        enable_lora=True,
        max_lora_rank=16,
        enable_prefix_caching=True,
        seed=3407,
    )
    sp = SamplingParams(temperature=0.0, max_tokens=768)

    print(f"== base model: {len(prompts)} problems ==")
    base_out = [o.outputs[0].text for o in llm.chat(prompts, sp)]
    print("== GRPO-tuned (LoRA) ==")
    lora = LoRARequest("grpo", 1, args.adapter)
    tuned_out = [o.outputs[0].text for o in llm.chat(prompts, sp, lora_request=lora)]

    results = {
        "model": MODEL,
        "adapter": args.adapter,
        "sampling": "greedy (temperature=0), max_tokens=768, seed=3407",
        "base": score(base_out, golds),
        "tuned": score(tuned_out, golds),
    }
    Path("eval/results").mkdir(parents=True, exist_ok=True)
    out_name = f"gsm8k_limit{args.limit}.json" if args.limit else "gsm8k.json"
    with open(f"eval/results/{out_name}", "w") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))

    # before/after traces: contrast cases first (base wrong AND tuned right),
    # then pad with any tuned-right problems
    contrast = [
        i for i, (b, t, g) in enumerate(zip(base_out, tuned_out, golds))
        if answers_match(extract_answer(t), g) and not answers_match(lenient_extract(b), g)
    ]
    tuned_right = [
        i for i, (t, g) in enumerate(zip(tuned_out, golds))
        if answers_match(extract_answer(t), g)
    ]
    order = contrast + [i for i in tuned_right if i not in contrast]
    traces = []
    for i in order[: args.traces]:
        b, t, g = base_out[i], tuned_out[i], golds[i]
        q = next(m["content"] for m in prompts[i] if m["role"] == "user" and "2 + 3" not in m["content"])
        tag = " — base WRONG, tuned RIGHT" if i in contrast else ""
        traces.append(
            f"## Test problem {i} (gold: {g}){tag}\n\n**Question:** {q}\n\n"
            f"### Base model\n\n```\n{b.strip()}\n```\n\n"
            f"### GRPO-tuned\n\n```\n{t.strip()}\n```\n"
        )
    with open("docs/sample_traces.md", "w") as f:
        f.write("# Before/after reasoning traces (held-out GSM8K)\n\n" + "\n".join(traces))
    print(f"wrote {len(traces)} traces to docs/sample_traces.md")


if __name__ == "__main__":
    main()
