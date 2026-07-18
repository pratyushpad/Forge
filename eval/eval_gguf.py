"""Quality + latency of the Q4_K_M GGUF via llama-cli, on a GSM8K subset.

Runs the built llama.cpp llama-cli once per problem (CPU), parses the <answer>,
and scores exact-match against gold. Also records tok/s from llama.cpp's timing
line. Produces the Q4 side of the quant-delta table.

Usage: python -m eval.eval_gguf --gguf export/gguf/forge-...-q4_k_m.gguf --limit 100
"""

import argparse
import json
import re
import subprocess
import time
from pathlib import Path

from data.gsm8k import load_gsm8k
from train.rewards import answers_match, extract_answer

LLAMA_CLI = str(Path.home() / "llama.cpp/build/bin/llama-cli")
TOKS_RE = re.compile(r"eval time =.*?([\d.]+) tokens per second")


def run_one(gguf: str, prompt_text: str, threads: int) -> tuple[str, float]:
    cmd = [
        LLAMA_CLI, "-m", gguf, "-p", prompt_text, "-n", "512",
        "-t", str(threads), "--temp", "0", "-no-cnv", "--no-display-prompt",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    toks = TOKS_RE.findall(r.stderr)
    tps = float(toks[-1]) if toks else 0.0
    return r.stdout.strip(), tps


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gguf", required=True)
    p.add_argument("--limit", type=int, default=100)
    p.add_argument("--threads", type=int, default=16)
    p.add_argument("--tag", default="q4_k_m")
    args = p.parse_args()

    # Build the chat-formatted prompt strings with the same tokenizer template.
    from transformers import AutoTokenizer
    tok = AutoTokenizer.from_pretrained("export/merged_16bit")
    ds = load_gsm8k("test").select(range(args.limit))

    correct, tps_list = 0, []
    t0 = time.time()
    for i, row in enumerate(ds):
        text = tok.apply_chat_template(row["prompt"], add_generation_prompt=True, tokenize=False)
        out, tps = run_one(args.gguf, text, args.threads)
        if tps:
            tps_list.append(tps)
        if answers_match(extract_answer(out), row["answer"]):
            correct += 1
        if (i + 1) % 20 == 0:
            print(f"  {i+1}/{len(ds)}  running acc={correct/(i+1):.3f}")

    result = {
        "backend": f"llama.cpp CPU ({args.threads}t)",
        "quant": args.tag,
        "n": len(ds),
        "pass@1": correct / len(ds),
        "gen_tok_per_s_mean": sum(tps_list) / len(tps_list) if tps_list else 0.0,
        "wall_s": round(time.time() - t0, 1),
    }
    Path("eval/results").mkdir(parents=True, exist_ok=True)
    with open(f"eval/results/gguf_{args.tag}.json", "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
