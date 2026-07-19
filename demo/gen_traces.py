"""Build demo/public/traces.json from the committed trace records.

Two sources, both already in the repo — this script only reshapes them, it never
runs a model:
  - docs/sample_traces.md   5 held-out contrast cases (base wrong, tuned right)
  - demo/public/examples.json  the curated demo set, mined for the double-miss

The double-miss is included on purpose. Five hand-picked wins is a highlight
reel; shipping the case where both models fail is what makes the gallery
evidence instead of marketing.

Usage: python -m demo.gen_traces
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "sample_traces.md"
EXAMPLES = ROOT / "demo" / "public" / "examples.json"
OUT = ROOT / "demo" / "public" / "traces.json"

# "## Test problem 3 (gold: 540) — base WRONG, tuned RIGHT"
HEADING = re.compile(r"^## Test problem (\d+) \(gold: ([^)]+)\)", re.M)
QUESTION = re.compile(r"^\*\*Question:\*\* (.+?)$", re.M)
BLOCK = re.compile(r"^### (Base model|GRPO-tuned)\s*\n+```\n(.*?)\n```", re.M | re.S)
ANSWER_RE = re.compile(r"<answer>\s*(.*?)\s*</answer>", re.S)


def parse_markdown(text: str) -> list[dict]:
    traces = []
    starts = [(m.start(), m.group(1), m.group(2)) for m in HEADING.finditer(text)]
    for i, (pos, idx, gold) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(text)
        chunk = text[pos:end]

        q = QUESTION.search(chunk)
        if not q:
            raise SystemExit(f"no **Question:** line under test problem {idx}")

        outputs = {}
        for label, body in BLOCK.findall(chunk):
            key = "tuned" if label == "GRPO-tuned" else "base"
            found = ANSWER_RE.findall(body)
            outputs[key] = {
                "raw": body,
                "answer": found[-1].strip() if found else None,
            }
        missing = {"base", "tuned"} - outputs.keys()
        if missing:
            raise SystemExit(f"test problem {idx} is missing {missing}")

        traces.append(
            {
                "id": f"test-{idx}",
                "source": "docs/sample_traces.md",
                "split": "GSM8K held-out test",
                "question": q.group(1).strip(),
                "gold": gold.strip(),
                "models": outputs,
            }
        )
    return traces


def double_miss() -> dict | None:
    """The curated example where neither model lands the answer."""
    data = json.loads(EXAMPLES.read_text())
    for ex in data["examples"]:
        m = ex["models"]
        if not m["base"]["correct"] and not m["tuned"]["correct"]:
            return {
                "id": "demo-double-miss",
                "source": "demo/public/examples.json",
                "split": "curated demo set",
                "question": ex["question"].strip(),
                "gold": ex["gold"],
                "models": {
                    k: {"raw": m[k]["raw"], "answer": m[k]["answer"]} for k in ("base", "tuned")
                },
            }
    return None


def main() -> None:
    traces = parse_markdown(SRC.read_text())
    if not traces:
        raise SystemExit(f"parsed 0 traces from {SRC} — check the heading format")

    miss = double_miss()
    if miss is None:
        raise SystemExit("no double-miss found in examples.json — remove this step or the copy")
    traces.append(miss)

    OUT.write_text(json.dumps({"traces": traces}, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} — {len(traces)} traces ({len(traces) - 1} contrast + 1 double-miss)")


if __name__ == "__main__":
    main()
