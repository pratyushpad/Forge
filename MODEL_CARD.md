# Model Card — Forge: Qwen2.5-1.5B GRPO-tuned for GSM8K reasoning

Forge is Qwen2.5-1.5B-Instruct trained with **GRPO** (Group Relative Policy
Optimization — RL with verifiable rewards, the DeepSeek-R1 technique) to solve
grade-school math with explicit reasoning, on a single **RTX 5060 (8GB, Blackwell
sm_120)** inside WSL2. Every number below is measured from a committed script with
a fixed seed (3407); nothing is estimated.

## Base & method
- **Base model:** `Qwen/Qwen2.5-1.5B-Instruct`, loaded 4-bit (NF4, bf16 compute).
- **Method:** GRPO via TRL `GRPOTrainer` + Unsloth `FastLanguageModel`, LoRA adapter,
  vLLM-colocated rollouts. No supervised fine-tuning — pure RL from the instruct base.
- **Adapter:** LoRA r=16, α=32, on all attention + MLP projections.

## Dataset
- **GSM8K** (`openai/gsm8k`, main): 7,473 train / 1,319 held-out test. Exact-match
  gradeable — no LLM judge. Gold answer parsed from the `#### N` suffix.
- **Prompt** elicits structure: a system instruction + one worked example, asking for
  `<reasoning>…</reasoning><answer>…</answer>` with a numeric-only answer block.

## Reward functions (max 3.25 / completion)
| Reward | Value | Signal |
|---|---|---|
| `correctness` | +2.0 | parsed `<answer>` numerically equals gold (`$1,234.50`≡`1234.5`) |
| `format` | +0.5 | strict `<reasoning>…</reasoning><answer>…</answer>` structure |
| `numeric` | +0.25 | answer block parses as a number |
| `tag_presence` | +0.5 | graded, +0.125 per required tag present exactly once |

`tag_presence` and the one-shot prompt example were added after the first smoke run
measured **0/80 tagged completions** — the base model ignored the format, so every
reward was 0 and GRPO had no gradient. The graded cold-start signal fixed it. (See
README "Reward design".)

## GRPO configuration (full run)
| | |
|---|---|
| steps × generations | 750 × 8 |
| batch / grad-accum | 1 × 8 (one full 8-completion group per optimizer step) |
| learning rate | 5e-6, cosine, 10% warmup, AdamW-8bit |
| seq length | 1024 (256 prompt / 768 completion) |
| gradient checkpointing | Unsloth |
| seed | 3407 |

## Results — all measured

### Reasoning (GSM8K test, 1,319 held-out, greedy, seed 3407)
| | base | GRPO-tuned |
|---|---|---|
| pass@1 (lenient — any final number) | 58.8% | **70.0%** |
| pass@1 (strict — must use answer tags) | 54.4% | **70.0%** |

**Headline: 58.8% → 70.0% pass@1** (+11.2 pts; +15.6 on the strict contract). The
tuned model's strict and lenient scores are identical → 100% format compliance,
nothing lost to parsing.

### No catastrophic forgetting (ARC-Challenge, 200 items)
| base | tuned |
|---|---|
| 69.5% | 68.5% |

−1.0 pt (2 questions) — within noise. Math RL did not degrade general reasoning.

### Training dynamics (full run)
- Mean group reward **1.23 → 2.80** (of 3.25), first-25 → last-25 steps
- Wall-clock **86.2 min**, **peak VRAM 3.64 GiB** (of ~6.6 GiB usable; Windows holds ~1.5)
- KL to base rose gently to ~0.05; completion length flat ~180 tokens (no length hacking)
- Reward curve: `docs/reward_curve.png`

### Quantization delta (100 held-out, same backend)
| precision | pass@1 | size |
|---|---|---|
| f16 | 0.76 | 2.94 GB |
| Q4_K_M | 0.69 | 0.93 GB (3.15× smaller) |

4-bit costs ~7 pts pass@1 here — a real, documented tradeoff (f16 GGUF matched
fp16/vLLM exactly, so the drop is quantization, not backend).

### Serving throughput (RTX 5060, single stream)
| backend | TTFT | decode tok/s |
|---|---|---|
| vLLM fp16 (GPU) | 19 ms | 105 (674 batched) |
| Ollama Q4_K_M (GPU) | 139 ms | 228 |

## Intended use & limits
- **Use:** grade-school-style arithmetic word problems, as a reasoning demo.
- **Limits:** trained only on GSM8K-style math; not a general assistant. 70% pass@1
  means it is still wrong ~30% of the time — not for unsupervised numeric decisions.
- **Reproduce:** `make full-train` → `make eval` → `make export` → `make serve-vllm`.

## Reward-hacking audit
Reward rose while held-out accuracy also rose (58.8→70.0), completion length stayed
flat, and held-out traces are genuine step-by-step solutions — no evidence of gaming
the reward. See `docs/sample_traces.md`.
