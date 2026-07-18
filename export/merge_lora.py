"""Merge the GRPO LoRA adapter into the fp16 base → a standalone HF model.

QLoRA deploy path: the adapter was trained on the 4-bit base, but we merge it
onto the original fp16 Qwen2.5-1.5B-Instruct (not the 4-bit one) so the exported
weights carry no base-quantization error. Runs on CPU — 1.5B fp16 is ~3GB, no GPU
needed, leaves VRAM free.

Usage: python -m export.merge_lora [--adapter outputs/full] [--out export/merged_16bit]
"""

import argparse

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE = "Qwen/Qwen2.5-1.5B-Instruct"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--adapter", default="outputs/full")
    p.add_argument("--out", default="export/merged_16bit")
    args = p.parse_args()

    print(f"loading fp16 base {BASE} on CPU ...")
    base = AutoModelForCausalLM.from_pretrained(
        BASE, torch_dtype=torch.float16, device_map="cpu"
    )
    print(f"applying LoRA adapter {args.adapter} ...")
    model = PeftModel.from_pretrained(base, args.adapter)
    print("merging (merge_and_unload) ...")
    model = model.merge_and_unload()

    model.save_pretrained(args.out, safe_serialization=True)
    AutoTokenizer.from_pretrained(BASE).save_pretrained(args.out)
    print(f"saved merged fp16 model to {args.out}")


if __name__ == "__main__":
    main()
