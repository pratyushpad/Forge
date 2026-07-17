"""GRPO training — Qwen2.5-1.5B-Instruct on GSM8K, 8GB-VRAM-safe.

Smoke run (Phase 2):  python -m train.train_grpo --max-steps 20 --output-dir outputs/smoke
Full run (Phase 3):   python -m train.train_grpo --output-dir outputs/full

Unsloth must be imported before transformers/trl.
"""

import argparse
import json
import time

from unsloth import FastLanguageModel  # noqa: E402  (must precede trl/transformers)

import torch
from trl import GRPOConfig, GRPOTrainer

from data.gsm8k import SEED, load_gsm8k
from train.rewards import REWARD_FUNCS

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
MAX_SEQ_LENGTH = 1024
MAX_PROMPT_LENGTH = 256


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--max-steps", type=int, default=-1, help="-1 = full epoch")
    p.add_argument("--num-generations", type=int, default=4)
    p.add_argument("--grad-accum", type=int, default=4)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lr", type=float, default=5e-6)
    p.add_argument("--output-dir", default="outputs/grpo")
    p.add_argument("--no-vllm", action="store_true", help="fallback: HF generate for rollouts")
    p.add_argument("--gpu-mem-util", type=float, default=0.35, help="vLLM share of VRAM")
    p.add_argument("--save-steps", type=int, default=100)
    return p.parse_args()


def main():
    args = parse_args()
    torch.cuda.reset_peak_memory_stats()
    t0 = time.time()

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=MODEL,
        max_seq_length=MAX_SEQ_LENGTH,
        load_in_4bit=True,
        fast_inference=not args.no_vllm,
        gpu_memory_utilization=args.gpu_mem_util,
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.lora_r,
        lora_alpha=args.lora_r * 2,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        use_gradient_checkpointing="unsloth",
        random_state=SEED,
    )

    train_ds = load_gsm8k("train")

    config = GRPOConfig(
        output_dir=args.output_dir,
        learning_rate=args.lr,
        adam_beta1=0.9,
        adam_beta2=0.99,
        weight_decay=0.1,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        optim="adamw_8bit",
        per_device_train_batch_size=1,
        gradient_accumulation_steps=args.grad_accum,
        num_generations=args.num_generations,
        max_prompt_length=MAX_PROMPT_LENGTH,
        max_completion_length=MAX_SEQ_LENGTH - MAX_PROMPT_LENGTH,
        max_steps=args.max_steps,
        num_train_epochs=1,
        save_steps=args.save_steps,
        logging_steps=1,
        report_to="none",
        seed=SEED,
        use_vllm=not args.no_vllm,
        vllm_mode="colocate",
    )

    trainer = GRPOTrainer(
        model=model,
        processing_class=tokenizer,
        reward_funcs=REWARD_FUNCS,
        args=config,
        train_dataset=train_ds,
    )
    trainer.train()

    wall = time.time() - t0
    peak = torch.cuda.max_memory_allocated() / 1024**3
    reserved = torch.cuda.max_memory_reserved() / 1024**3

    trainer.save_model(args.output_dir)
    with open(f"{args.output_dir}/log_history.json", "w") as f:
        json.dump(trainer.state.log_history, f, indent=2)

    print("\n================ RUN SUMMARY ================")
    print(f"steps: {trainer.state.global_step} | wall-clock: {wall/60:.1f} min")
    print(f"peak VRAM: {peak:.2f} GiB allocated / {reserved:.2f} GiB reserved")
    tail = [h for h in trainer.state.log_history if "reward" in h][-3:]
    for h in tail:
        print({k: round(v, 4) for k, v in h.items() if isinstance(v, (int, float))})


if __name__ == "__main__":
    main()
