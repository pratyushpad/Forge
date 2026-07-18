"""No-catastrophic-forgetting check: ARC-Challenge multiple choice, base vs GRPO-tuned.

GRPO on math should not wreck general knowledge/reasoning. 200 fixed items,
greedy, answer parsed as the first A-E letter in the response.

Usage: python -m eval.eval_arc [--adapter outputs/full] [--n 200]
Writes eval/results/arc.json.
"""

import argparse
import json
import re
from pathlib import Path

from datasets import load_dataset
from vllm import LLM, SamplingParams
from vllm.lora.request import LoRARequest

MODEL = "unsloth/qwen2.5-1.5b-instruct-unsloth-bnb-4bit"
LETTER_RE = re.compile(r"\b([A-E])\b")


def to_prompt(item) -> list[dict]:
    lines = [item["question"], ""]
    labels = item["choices"]["label"]
    for label, text in zip(labels, item["choices"]["text"]):
        lines.append(f"{label}. {text}")
    lines.append("")
    lines.append("Answer with just the letter of the correct choice.")
    return [{"role": "user", "content": "\n".join(lines)}]


def parse_letter(text: str) -> str | None:
    m = LETTER_RE.search(text.strip())
    return m.group(1) if m else None


def accuracy(outputs, golds) -> float:
    return sum(parse_letter(o) == g for o, g in zip(outputs, golds)) / len(golds)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--adapter", default="outputs/full")
    p.add_argument("--n", type=int, default=200)
    args = p.parse_args()

    ds = load_dataset("allenai/ai2_arc", "ARC-Challenge", split="test").select(range(args.n))
    prompts = [to_prompt(x) for x in ds]
    golds = [x["answerKey"] for x in ds]

    llm = LLM(
        model=MODEL,
        quantization="bitsandbytes",
        load_format="bitsandbytes",
        max_model_len=1024,
        gpu_memory_utilization=0.65,
        enable_lora=True,
        max_lora_rank=16,
        seed=3407,
    )
    sp = SamplingParams(temperature=0.0, max_tokens=32)

    base = accuracy([o.outputs[0].text for o in llm.chat(prompts, sp)], golds)
    lora = LoRARequest("grpo", 1, args.adapter)
    tuned = accuracy(
        [o.outputs[0].text for o in llm.chat(prompts, sp, lora_request=lora)], golds
    )

    results = {"n": args.n, "dataset": "ARC-Challenge test[:n]", "base": base, "tuned": tuned}
    Path("eval/results").mkdir(parents=True, exist_ok=True)
    with open("eval/results/arc.json", "w") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
