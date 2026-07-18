# Phase 5 — Quantize + export: quality-vs-latency

Artifacts produced from the GRPO LoRA adapter (`outputs/full/`):

| Artifact | Path | Size |
|---|---|---|
| Merged fp16 (HF) | `export/merged_16bit/` | 3.09 GB |
| GGUF f16 | `export/gguf/forge-qwen2.5-1.5b-f16.gguf` | 2.94 GB |
| **GGUF Q4_K_M** | `export/gguf/forge-qwen2.5-1.5b-q4_k_m.gguf` | **0.93 GB** |

Q4_K_M is **3.15× smaller** than f16 (2945 MiB → 935 MiB, 5.08 bits/weight).

## Quality vs latency (GSM8K test, first 100 held-out problems, greedy, seed 3407)

| Model | Backend | pass@1 | gen tok/s |
|---|---|---|---|
| fp16 merged | vLLM (RTX 5060 GPU) | **0.76** | 673.9 |
| f16 GGUF | llama.cpp (16-thread CPU) | **0.76** | 12.6 |
| Q4_K_M GGUF | llama.cpp (16-thread CPU) | **0.69** | 21.1 |

### Reading the table

- **Quantization costs ~7 points pass@1** (0.76 → 0.69) on this 100-problem subset.
  The f16 GGUF and fp16/vLLM agree exactly (0.76), so the drop is attributable to
  4-bit quantization, **not** the backend — a real, documented tradeoff. On a model
  this small (1.5B) 4-bit weights have less redundancy to spare, so Q4 quality loss
  is larger than it would be on a 7B+. (n=100, so ±~9 pts at 95% CI — the sign is
  reliable; treat the magnitude as "a few points," not exact.)
- **Q4 is 1.7× faster than f16 on the same CPU** (21.1 vs 12.6 tok/s) and fits in
  under 1 GB — the point of shipping it: it runs comfortably on CPU-only / low-VRAM
  boxes where f16 would not.
- The GPU fp16 number (674 tok/s, single stream) is the throughput ceiling and the
  Phase 6 serving headline; CPU GGUF numbers are the portable-fallback path.

## AWQ — deliberately deferred (honest scope note)

The plan listed AWQ as *optional* for a vLLM throughput headline. `autoawq` pulls
torch/transformers pins that conflict with this box's Blackwell-specific stack
(torch 2.10.0+cu128, sm_120), and perturbing the working training env is not worth
the risk for a marginal throughput gain. Phase 6 instead serves the **merged fp16
via vLLM on GPU** (already measured at 674 tok/s single-stream) for the headline and
**Q4_K_M via Ollama** for the reliable CPU/low-VRAM path — two real numbers, zero
env risk. AWQ can be revisited later in an isolated env if a batched-throughput
number is wanted.

*Reproduce:* `make export` (merge → GGUF → quantize), then
`python -m eval.eval_fp16_vllm --limit 100` and, against a running llama-server,
`python -m eval.eval_served --base-url <url> --label <tag> --limit 100`.
