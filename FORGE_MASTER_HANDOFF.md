# FORGE — Master Handoff Brief (GRPO Reasoning-RL on RTX 5060)

**Read this entire file before doing anything.** You are Claude (Fable 5) running in a terminal
on Pratyush's Windows laptop, inside **WSL2 (Ubuntu)**. This file is the complete, self-contained
brief: who the owner is, every decision already made, the hard constraints, and the phase-gated
build plan. Do not re-litigate decisions recorded here — they are final.

---

## PART 1 — OWNER CONTEXT (why this project exists)

**Owner:** Pratyush Padhy — B.S. Computer Science (Intelligent Systems), UC Irvine, GPA 3.86,
expected 2028. Currently AI/ML Intern at **TCS Medical Robotics Center** (CMU campus): built a
5-stage behavior-tree pipeline (ROS2 Jazzy, Gazebo, py_trees), trained a **PPO** policy
(Stable-Baselines3) for robotic manipulation with 99% target-reach success, and fine-tuned a
450M **SmolVLA** vision-language-action model via imitation learning. Prior: Ready Tutor
(full-stack SWE intern), Robotics for All.

**Resume strategy (FINAL — decided 2026-07-16, 3-project cap):**

| Slot | Project | Proves |
|------|---------|--------|
| 1 | **Chronicle** (done, live) — job aggregation platform, hybrid semantic search/recsys, pgvector HNSW, NDCG@10 0.853→0.943 | SWE + search/recsys |
| 2 | **Forge** (THIS PROJECT) — GRPO reasoning-RL, quantize, serve | LLM training + RL depth |
| 3 | **Lumina** (next, after Forge) — RAG system | RAG/LLM apps |

- **FacePulse** (CV emotion classifier) and **Argus-AI** (YOLOv8 traffic violations) are **dropped
  from the resume** — commodity CV; they live on portfolio/GitHub only. TCS SmolVLA covers vision.
- A 4th "VLM fine-tune" idea was considered and **shelved** (3-project cap; Lumina wins the slot
  because RAG is a named requirement in target job descriptions).
- **Why Forge is GRPO, not plain QLoRA SFT:** LoRA fine-tunes are commodity resume bullets. GRPO
  (RL with verifiable rewards, the DeepSeek-R1 technique) is rare on a student resume, current,
  and creates the unique narrative that ties to his TCS work:
  **"RL across domains — PPO for robotic manipulation (TCS), GRPO for LLM reasoning (Forge)."**
  This narrative multiplier is the whole point. Protect it.

**Is this a web app?** Mostly no — the substance is the training run, eval, quantization, and
serving. But it ENDS with a thin web demo (Phase 8) so recruiters get something clickable,
matching the "consumer-friendly AND genuinely impressive" bar set for all his projects.

---

## PART 2 — HARDWARE / ENVIRONMENT (HARD CONSTRAINTS — never violate)

- **Windows laptop: RTX 5060, 8GB VRAM (Blackwell, sm_120) + Ryzen 7 8700F (8c/16t) + 32GB RAM.**
- Run ALL training inside **WSL2 (Ubuntu)** — Unsloth/vLLM/bitsandbytes are Linux-first. Do NOT
  attempt native Windows training.
- Blackwell requires **CUDA 12.8+ / PyTorch cu128** builds, or there are no GPU kernels at all.
- **8GB VRAM is the binding constraint.** GRPO is memory-hungry (multiple rollouts per prompt):
  **start with Qwen2.5-1.5B-Instruct**, attempt Qwen2.5-3B-Instruct only if measured VRAM allows.
- The GPU driver is installed on **Windows only** — never install an NVIDIA driver inside WSL.

## PART 3 — OPERATING RULES

- **8 build phases + 1 demo phase (0–8). STOP after every phase**, print a summary, WAIT for the
  human to say "continue." Never run two phases without confirmation.
- Legend: 🧑 = human does it (system/admin steps). 🤖 = agent does it.
- **Golden rule: never claim a number you didn't measure.** Every "X→Y" must reproduce from a
  committed script with a fixed seed. Report peak VRAM every phase.
- **Honest fallbacks:** if something OOMs on 8GB, step down the ladder (Part 5) and SAY SO. A
  documented constraint reads as more competent than a fake benchmark.
- **Reward-hacking watch:** if reward climbs but held-out accuracy doesn't, the model is gaming
  the reward — inspect completions, fix the reward function, and document it (great story).

---

## PART 4 — THE BUILD (phase-gated)

### PHASE 0 — Environment: WSL2 + CUDA (Blackwell) + verify GPU
**🧑 HUMAN — on Windows FIRST, before the agent does anything:**
1. PowerShell (Admin): `wsl --install` → **reboot**.
2. PowerShell: `wsl --update`
3. Install the **latest NVIDIA Windows driver** for the RTX 5060 (GeForce/Studio).
   ⚠️ Do NOT install any GPU driver *inside* WSL — the Windows driver passes the GPU through.
4. Open Ubuntu (WSL). `nvidia-smi` must show "NVIDIA GeForce RTX 5060".
5. Install Node + Claude Code inside WSL; start the agent inside WSL in the project folder with
   this file.

**🤖 AGENT — Phase 0 tasks:**
- Confirm `nvidia-smi` shows the RTX 5060 (if not, STOP — driver/WSL issue for the human).
- Install Miniconda; create env `forge` (Python 3.11).
- Install PyTorch for Blackwell: `pip install torch --index-url https://download.pytorch.org/whl/cu128`
- **GATE (do not proceed until it passes):**
  `python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"`
  → must print `True NVIDIA GeForce RTX 5060`.
- Install pinned: `unsloth` (+ GRPO/vLLM extras), `trl`, `datasets`, `transformers`, `vllm`,
  `accelerate`. Record versions.
- Smoke test: load `Qwen2.5-1.5B-Instruct` 4-bit on GPU, generate 10 tokens, print peak VRAM.
- **⏸ STOP.** Report: GPU name, torch CUDA True, versions, smoke-gen output, peak VRAM.

### PHASE 1 — Repo scaffold + data + reward functions
- `git init`; structure: `data/ train/ eval/ export/ serve/ demo/ docs/`; `Makefile` (targets grow).
- **Dataset: GSM8K** (grade-school math — exact-match gradeable, NO LLM judge needed). Load via
  `datasets`; deterministic train/test split; keep the pipeline dataset-agnostic for a future swap.
- Prompt format eliciting structure: `<reasoning>…</reasoning><answer>…</answer>`.
- **Reward functions (the heart of GRPO):**
  - `correctness_reward`: parse the model's final answer, exact-match vs gold → main reward.
  - `format_reward`: small reward for producing the required tags (stabilizes training).
  - (Optional) length/soft rewards — document any added.
  - Unit-test both on 3–4 handmade examples with known expected rewards.
- **⏸ STOP.** Report: dataset sizes, prompt template, reward unit-test results.

### PHASE 2 — Wire GRPO + tiny smoke train (prove it trains on 8GB)
- Unsloth `FastLanguageModel` (`Qwen2.5-1.5B-Instruct`, `load_in_4bit=True`) + TRL `GRPOTrainer`.
- 8GB-safe config: `max_seq_length≈1024`, modest `max_prompt_length`, `num_generations` 4–8
  (lower = less VRAM), `per_device_train_batch_size=1` + grad accumulation,
  `gradient_checkpointing="unsloth"`, LoRA r=16–32. Use Unsloth's vLLM-backed fast generation for
  rollouts if it fits; else HF generate.
- Run **~20 steps only** to confirm: no OOM, reward computed, loss/reward logged, GPU pegged.
- **⏸ STOP.** Report: trains without OOM, peak VRAM, sample completions + their rewards.
  (If 1.5B has lots of headroom, note whether 3B is worth trying in Phase 3.)

### PHASE 3 — Full GRPO training run
- Full run with logging: **reward curve** (should trend up), mean completion length, KL, peak
  VRAM, wall-clock. Save checkpoints + periodic sample completions (show reasoning emerging).
- Apply the reward-hacking watch (Part 3). Commit the reward-curve plot.
- **⏸ STOP.** Report: final reward, curve plot, training time, peak VRAM, model/size actually used.

### PHASE 4 — Evaluation (the money shot)
- **Base vs GRPO-tuned on held-out GSM8K → pass@1 accuracy X→Y** (the headline number).
- **No-catastrophic-forgetting check:** small general subset (a few MMLU/ARC items) base vs tuned
  — measuring you didn't wreck general ability is a senior move most skip.
- 3–5 before/after reasoning traces showing the model "thinking" after GRPO.
- Reproducible from a committed script + fixed seed.
- **⏸ STOP.** Report: pass@1 X→Y, forgetting-check numbers, sample traces.

### PHASE 5 — Quantize + export
- Merge LoRA → export **GGUF Q4_K_M** (reliable) and optionally **AWQ** (for vLLM throughput).
- Quality-vs-latency table: tuned fp16 vs Q4 (does quantization cost accuracy? report it).
- **⏸ STOP.** Report: artifacts produced, quality delta table.

### PHASE 6 — Serve locally + measure throughput
- **Reliable:** Ollama serving the GGUF, OpenAI-compatible endpoint + streaming; report tok/s.
- **Headline:** vLLM serving AWQ → tokens/sec on the 5060 + time-to-first-token.
- One provider-agnostic interface with a **hosted fallback** (demo works when the box is off —
  and this is exactly what Lumina's Phase 3 will consume later; point Lumina at this box).
- **⏸ STOP.** Report: tok/s (Ollama + vLLM), a working streamed sample.

### PHASE 7 — Docs (résumé payoff)
- `MODEL_CARD.md`: base, dataset, reward functions, GRPO config, pass@1 X→Y, forgetting check,
  quant delta, tok/s, peak VRAM — **measured numbers only**.
- `README.md`: architecture, reward-function design, reward-curve plot, quickstart, 10-second
  results block; lead with the **RL-across-domains** narrative.
- **⏸ STOP.** Print the final résumé line (Part 6) filled with real numbers.

### PHASE 8 — Consumer demo web app (added this session — the "clickable" layer)
- Small **Next.js/TypeScript** app (matches his other projects' stack) in `demo/`:
  - User types a math/reasoning problem → **base model vs GRPO-tuned model side by side**,
    streaming, with the `<reasoning>` trace rendered live (collapsible), then the answer.
  - A results panel showing the reward curve and the pass@1 X→Y bar — the proof on the page.
  - Backend = the Phase 6 OpenAI-compatible endpoint (local box) with the hosted fallback so the
    public demo works when the laptop is off. Deploy frontend to Vercel/Netlify like his others.
- Keep it thin: the demo showcases the model; it is not the project.
- **⏸ STOP. DONE.** Final report: demo URL, everything in the résumé line verified.

---

## PART 5 — FALLBACK LADDER (8GB reality — use and document if needed)
3B → 1.5B → 0.5B model · `num_generations` ↓ · `max_seq_length` ↓ · batch ↓ ·
vLLM rollouts → HF generate. Never claim a config that OOMs.

## PART 6 — RÉSUMÉ LINE (fill only with real measured numbers)
> Trained Qwen2.5-[1.5/3]B to reason via **GRPO** (RL with verifiable rewards, Unsloth) on an
> RTX 5060 (8GB), lifting **GSM8K pass@1 X→Y** with a no-catastrophic-forgetting check; quantized
> to GGUF/AWQ and served locally at **N tok/s** behind a hosted-fallback interface. Applied RL
> across domains — **PPO** for robotic manipulation and **GRPO** for LLM reasoning.

## PART 7 — AGENT NOTES
- Build with **Fable 5**, phase-gated (0→8, verify each phase before continuing). Keep **Opus** on
  standby for Phase 0 CUDA/Blackwell/Unsloth debugging — the highest-uncertainty part.
- Do NOT start past Phase 0 until the `torch.cuda.is_available() == True` gate passes.
- Source briefs this file supersedes/merges (kept in `~/Downloads/Prompts/` on the Mac):
  `forge_grpo_ONESHOT.md`, `forge_grpo_reasoning_prompt.md`; `llm_finetune_serve_prompt.md` was
  the old QLoRA-SFT plan and is fully superseded — ignore it.
- After Forge ships: next project is **Lumina** (RAG), which consumes Forge's served endpoint.
