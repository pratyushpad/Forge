"""GSM8K data pipeline for GRPO.

Dataset-agnostic surface: a loader returns a `datasets.Dataset` where each row has
  - "prompt": chat messages (system + user) eliciting <reasoning>/<answer> structure
  - "answer": gold final answer as a normalized string
Swapping datasets later means adding a loader with the same output schema.
"""

from datasets import Dataset, load_dataset

SYSTEM_PROMPT = """Respond in the following format:
<reasoning>
...
</reasoning>
<answer>
...
</answer>

The <answer> block must contain only the final numeric answer."""

SEED = 3407  # fixed seed for any shuffling/subsampling — reproducibility rule


def extract_gold_answer(answer_text: str) -> str:
    """GSM8K gold answers end with '#### <number>'. Return the number, comma-stripped."""
    return answer_text.split("####")[-1].strip().replace(",", "")


# One-shot example turns: Qwen2.5-1.5B ignores the format instruction alone
# (measured: 0/80 tagged completions in the first smoke run), which starves GRPO
# of any reward signal. A worked example makes tagged completions appear at step 0.
ONE_SHOT = [
    {"role": "user", "content": "What is 2 + 3?"},
    {"role": "assistant", "content": "<reasoning>\n2 + 3 = 5.\n</reasoning>\n<answer>\n5\n</answer>"},
]


def _to_row(example: dict) -> dict:
    return {
        "prompt": [
            {"role": "system", "content": SYSTEM_PROMPT},
            *ONE_SHOT,
            {"role": "user", "content": example["question"]},
        ],
        "answer": extract_gold_answer(example["answer"]),
    }


def load_gsm8k(split: str = "train") -> Dataset:
    """Load GSM8K with the canonical (deterministic) train/test split.

    split: "train" (7.5k, used for GRPO) or "test" (1.3k, held out for eval only).
    """
    ds = load_dataset("openai/gsm8k", "main", split=split)
    # load_from_cache_file=False: the map cache fingerprints _to_row itself but not
    # module-level globals like ONE_SHOT, so edits to the prompt would silently serve
    # stale rows. Re-mapping 7.5k rows costs ~1s.
    return ds.map(_to_row, load_from_cache_file=False)


LOADERS = {"gsm8k": load_gsm8k}


def load_reasoning_dataset(name: str = "gsm8k", split: str = "train") -> Dataset:
    return LOADERS[name](split)


if __name__ == "__main__":
    train, test = load_gsm8k("train"), load_gsm8k("test")
    print(f"train: {len(train)} examples | test (held out): {len(test)} examples")
    sample = train[0]
    print("\n--- sample prompt ---")
    for msg in sample["prompt"]:
        print(f"[{msg['role']}]\n{msg['content']}\n")
    print(f"--- gold answer: {sample['answer']!r} ---")
