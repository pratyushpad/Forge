# Phase 0 environment (recorded 2026-07-16)

GPU: RTX 5060 8GB (Blackwell sm_120), WSL2 Ubuntu, driver CUDA UMD 13.3
Python: 3.11.15 (conda env: forge)

```
accelerate                               1.14.0
bitsandbytes                             0.49.2
datasets                                 4.3.0
flashinfer-python                        0.6.6
numpy                                    2.2.6
peft                                     0.19.1
torch                                    2.10.0
unsloth_zoo                              2026.7.3
torchaudio                               2.10.0
torchvision                              0.25.0
transformers                             4.57.6
triton                                   3.6.0
trl                                      0.24.0
unsloth                                  2026.7.3
vllm                                     0.19.1
xformers                                 0.0.35
```

Note: vLLM 0.19.1 pins torch 2.10.0 (PyPI cu128 build, sm_120 included) — it replaced the initially installed 2.11.0+cu128. CUDA gate re-verified after: True, RTX 5060, GPU matmul OK.

## Smoke test (Qwen2.5-1.5B-Instruct, 4-bit NF4, bf16 compute, greedy)

- Prompt: "What is 7 * 8?" → generated 10 tokens: `The product of 7 and 8 is ` (cut at token cap, coherent)
- Load 37.5s (first run, includes weights already cached) | Gen 1.40s
- **Peak VRAM: 1.44 GiB allocated / 1.53 GiB reserved** (of ~6.6 GiB free after Windows display)
