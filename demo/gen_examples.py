"""Generate real base-vs-tuned outputs for the demo's curated problems.

Runs both the stock base (qwen2.5:1.5b-instruct) and the GRPO-tuned (forge-q4)
through Ollama and captures full completions + correctness. The demo replays these
(so the public page always works); live mode re-runs against a configured endpoint.

Usage: python -m demo.gen_examples  (Ollama serving on :11434 with both models)
"""

import json
import re
import time
from pathlib import Path

import requests

from data.gsm8k import ONE_SHOT, SYSTEM_PROMPT
from train.rewards import answers_match, extract_answer

OLLAMA = "http://127.0.0.1:11434/v1/chat/completions"

# Curated GSM8K-style problems — a mix, including known base-fails / tuned-wins.
PROBLEMS = [
    {"q": "Kylar went to the store to buy glasses. One glass costs $5, but every second glass costs only 60% of the price. Kylar wants to buy 16 glasses. How much does he pay?", "gold": "64"},
    {"q": "James runs 3 sprints 3 times a week. He runs 60 meters each sprint. How many total meters does he run a week?", "gold": "540"},
    {"q": "Weng earns $12 an hour for babysitting. Yesterday she babysat for 50 minutes. How much did she earn?", "gold": "10"},
    {"q": "Betty is saving for a $100 wallet. She has half the money she needs. Her parents give her $15, and her grandparents give twice as much as her parents. How much more money does Betty need?", "gold": "5"},
    {"q": "A robe takes 2 bolts of blue fiber and half that much white fiber. How many bolts in total does it take?", "gold": "3"},
    {"q": " Toulouse has twice as many sheep as Charleston. Charleston has 4 times as many sheep as Seattle. If Seattle has 20 sheep, how many do the three have together?", "gold": "260"},
]


def ask(model: str, question: str) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            *ONE_SHOT,
            {"role": "user", "content": question},
        ],
        "temperature": 0.0,
        "max_tokens": 512,
    }
    r = requests.post(OLLAMA, json=payload, timeout=600)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def split_trace(text: str) -> dict:
    """Separate <reasoning> and <answer> for the UI; keep raw for fidelity."""
    reasoning = re.search(r"<reasoning>\s*(.*?)\s*</reasoning>", text, re.DOTALL)
    return {
        "raw": text,
        "reasoning": reasoning.group(1).strip() if reasoning else text,
        "answer": extract_answer(text),
    }


def main():
    out = []
    for p in PROBLEMS:
        row = {"question": p["q"], "gold": p["gold"], "models": {}}
        for name, model in [("base", "qwen2.5:1.5b-instruct"), ("tuned", "forge-q4")]:
            t0 = time.time()
            text = ask(model, p["q"])
            parsed = split_trace(text)
            parsed["correct"] = answers_match(parsed["answer"], p["gold"])
            parsed["latency_s"] = round(time.time() - t0, 2)
            row["models"][name] = parsed
            flag = "OK " if parsed["correct"] else "XX"
            print(f"[{flag}] {name:5s} ans={parsed['answer']} gold={p['gold']} :: {p['q'][:45]}...")
        out.append(row)

    Path("demo/public").mkdir(parents=True, exist_ok=True)
    with open("demo/public/examples.json", "w") as f:
        json.dump({"generated": time.strftime("%Y-%m-%d"), "examples": out}, f, indent=2)
    base_ok = sum(r["models"]["base"]["correct"] for r in out)
    tuned_ok = sum(r["models"]["tuned"]["correct"] for r in out)
    print(f"\nwrote demo/public/examples.json — base {base_ok}/{len(out)}, tuned {tuned_ok}/{len(out)}")


if __name__ == "__main__":
    main()
