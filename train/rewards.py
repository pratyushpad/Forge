"""Reward functions for GRPO — the heart of the project.

TRL GRPOTrainer calls each function with (completions, **kwargs) where, in
conversational format, completions is a list of [{"role": "assistant", "content": ...}]
and dataset columns (e.g. "answer") arrive as keyword lists of the same length.

Reward design (documented per the brief):
  correctness_reward: +2.0  exact match of parsed <answer> vs gold — the main signal
  format_reward:      +0.5  strict <reasoning>…</reasoning><answer>…</answer> structure
  numeric_reward:     +0.25 the <answer> block parses as a number (soft shaping toward
                            numeric answers before correctness is achievable)
  tag_presence_reward:+0.5  graded cold-start signal: +0.125 per required tag present
                            exactly once — added after the first smoke run measured
                            0/80 completions with any tags (all-zero rewards = no
                            GRPO gradient)
Max total per completion: 3.25.
"""

import re

ANSWER_RE = re.compile(r"<answer>\s*(.*?)\s*</answer>", re.DOTALL)
STRICT_FORMAT_RE = re.compile(
    r"^\s*<reasoning>.*?</reasoning>\s*<answer>.*?</answer>\s*$", re.DOTALL
)


def extract_answer(text: str) -> str | None:
    """Pull the contents of the (last) <answer> block, or None if absent."""
    matches = ANSWER_RE.findall(text)
    return matches[-1].strip() if matches else None


def normalize_number(s: str) -> float | None:
    """'$1,234.50' -> 1234.5; '72' -> 72.0; non-numeric -> None."""
    cleaned = s.strip().replace(",", "").replace("$", "").rstrip("%").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def answers_match(predicted: str | None, gold: str) -> bool:
    if predicted is None:
        return False
    p, g = normalize_number(predicted), normalize_number(gold)
    if p is not None and g is not None:
        return p == g
    return predicted.strip() == gold.strip()


def _contents(completions) -> list[str]:
    return [c[0]["content"] for c in completions]


def correctness_reward(completions, answer, **kwargs) -> list[float]:
    return [
        2.0 if answers_match(extract_answer(text), gold) else 0.0
        for text, gold in zip(_contents(completions), answer)
    ]


def format_reward(completions, **kwargs) -> list[float]:
    return [
        0.5 if STRICT_FORMAT_RE.match(text) else 0.0 for text in _contents(completions)
    ]


def numeric_reward(completions, **kwargs) -> list[float]:
    return [
        0.25 if (a := extract_answer(text)) is not None and normalize_number(a) is not None else 0.0
        for text in _contents(completions)
    ]


def tag_presence_reward(completions, **kwargs) -> list[float]:
    def score(text: str) -> float:
        return sum(
            0.125
            for tag in ("<reasoning>", "</reasoning>", "<answer>", "</answer>")
            if text.count(tag) == 1
        )

    return [score(text) for text in _contents(completions)]


REWARD_FUNCS = [correctness_reward, format_reward, numeric_reward, tag_presence_reward]
