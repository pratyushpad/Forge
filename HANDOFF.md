# HANDOFF — Forge (complete project record + UI/UX handoff)

This is a **completed** project. All 8 build phases (train → eval → quantize → serve
→ docs → demo) are done, committed, and the demo is **live and public**. This file
is the full record of what was accomplished — every measured number, runtime, config,
and the deploy saga — followed by the **UI/UX handoff** for the next session.

- **Repo:** `~/forge` (public: https://github.com/pratyushpad/Forge)
- **Live demo:** https://forge-iota-coral.vercel.app
- **One-liner:** Trained Qwen2.5-1.5B to reason on GSM8K via **GRPO** (RL with
  verifiable rewards, the DeepSeek-R1 technique — no SFT, no human labels) on a
  single **8 GB RTX 5060**, lifting GSM8K pass@1 **58.8% → 70.0%** with no
  catastrophic forgetting, then quantized, served two ways, and shipped a demo.
- **Positioning — "RL across domains":** the LLM half of a pair with **PPO** for
  robotic manipulation (99% target-reach, TCS Medical Robotics). Same RL backbone,
  two action spaces: continuous robot control vs discrete token generation. Keep
  this framing in any copy.

---

## ⚠️ THE ONE RULE: never invent a number

Every metric in this file is **measured** and reproducible from a committed, seeded
script — nothing estimated. Every number on the demo page or in any doc must come
from the tables below. If a design/copy idea needs a stat we don't have, **ask** —
don't fabricate. This is a résumé project; one made-up number destroys its
credibility. (Golden rule from the original project handoff.)

---

# PART 1 — What was accomplished (all 8 phases)

### Commit history (each phase = one commit)
```
9bcf060  Phase 0-1: env docs, GSM8K pipeline, GRPO reward functions + tests
a639041  Phase 2: GRPO training script + 8GB smoke run; fix reward cold-start
4e2091b  Stage Phase 3 full-train target (750 steps x 8 gens)
41d3c8a  Phase 3: full GRPO run — 750 steps x 8 gens, reward 1.23->2.80
9ac52d9  Phase 4: eval — GSM8K 58.8%->70.0%, no forgetting (ARC 69.5%->68.5%)
7e06f3d  Phase 5: quantize + export — GGUF f16/Q4_K_M, quality-vs-latency table
2e1d170  Stop tracking .claude/settings.local.json (pre-public cleanup)
e501cfa  Phase 6: serve locally — vLLM fp16 + Ollama Q4 GGUF, provider-agnostic client
c2579db  Phase 7: docs — README + MODEL_CARD (measured numbers)
b766e48  Phase 8: Next.js demo — base vs GRPO-tuned side by side
5702e53  demo: bump Next.js 15.1.6 -> 15.5.20 (Vercel security gate)
f5a14ae  demo: force framework=nextjs (vercel.json) + live demo link
```

### Phase 0 — Environment (Blackwell sm_120 in WSL2)
- GPU: **RTX 5060 8 GB** (Blackwell sm_120), WSL2 Ubuntu, driver CUDA UMD 13.3.
  ~6.6 GiB usable (Windows display holds ~1.5 GiB).
- Python 3.11.15, conda env `forge`. CUDA gate passed: `torch.cuda.is_available()`
  = True on the 5060.
- Key versions (full list in `docs/PHASE0_ENV.md`):
  torch **2.10.0**+cu128, unsloth **2026.7.3**, trl **0.24.0**, vllm **0.19.1**,
  transformers **4.57.6**, bitsandbytes **0.49.2**, peft 0.19.1, accelerate 1.14.0,
  triton 3.6.0, xformers 0.0.35, flashinfer 0.6.6, datasets 4.3.0, numpy 2.2.6.
  (vLLM 0.19.1 pins torch 2.10.0 — replaced the initially installed 2.11.0; both
  cu128/sm_120.)
- Smoke test: Qwen2.5-1.5B-Instruct, 4-bit NF4, bf16 compute, greedy →
  load 37.5s, gen 1.40s, **peak VRAM 1.44 GiB allocated / 1.53 GiB reserved**.

### Phase 1 — Data + rewards
- `data/gsm8k.py`: GSM8K loader, `SYSTEM_PROMPT`, a **one-shot example** in the
  prompt (critical — see cold-start bug), `SEED=3407`, `extract_gold_answer`
  (parses `#### N`), `load_from_cache_file=False`.
- `train/rewards.py` — reward functions, **max 3.25 per completion**:
  | Reward | Value |
  |---|---|
  | correctness (final number matches gold) | +2.0 |
  | tag presence (graded, +0.125 per tag) | up to +0.5 |
  | format (exact `<reasoning>…</reasoning><answer>…</answer>`) | +0.5 |
  | numeric (answer is a number) | +0.25 |
- `tests/test_rewards.py`: 7 unit tests, all passing.

### Phase 2 — GRPO wiring + the cold-start fix
- `train/train_grpo.py`: TRL `GRPOTrainer` + Unsloth `FastLanguageModel`, vLLM
  colocate rollouts. LoRA r=16 α=32, lr 5e-6, seq 1024 (256 prompt / 768 completion).
- **Bug caught & fixed:** first smoke run scored **0/80 tagged completions** — the
  base model got math right but ignored the output format, so *every* reward was 0
  and GRPO had **no gradient**. Fix: added a one-shot example to the prompt + made
  `tag_presence_reward` graded (partial credit per tag) so there's a non-zero
  gradient to climb. This is the single most important technical detail of the run.

### Phase 3 — Full GRPO training run
- `make full-train` — **750 steps × 8 generations** (one full 8-completion group per
  optimizer step; batch 1 × grad-accum 8), seed 3407.
- **Wall-clock: 86.2 min. Peak VRAM: 3.64 GiB** (of ~6.6 usable — left room to use
  the machine while training).
- **Mean group reward 1.23 → 2.80** (of 3.25), first-25 → last-25 steps.
- KL to base rose gently to **~0.05**; completion length **flat ~180 tokens** (no
  length hacking).
- Adapter + checkpoints every 100 steps in `outputs/full/` (checkpoint-100…600).
  Reward curve: `docs/reward_curve.png` (script `eval/plot_training.py`).
- **Reward-hacking audit:** reward ↑ *and* held-out accuracy ↑ (58.8→70.0) *and*
  completion length flat *and* held-out traces are genuine step-by-step solutions →
  no gaming. See `docs/sample_traces.md`.

### Phase 4 — Evaluation (the headline numbers)
Greedy (temperature=0), max_tokens=768, seed 3407. Files in `eval/results/`.

**GSM8K — full 1,319 held-out test set** (`gsm8k.json`):
| | strict | lenient |
|---|---|---|
| base | 54.36% | **58.83%** |
| GRPO-tuned | **69.98%** | **69.98%** |

→ Headline **58.8% → 70.0%** (+11.2 pts lenient; +15.6 pts strict). Tuned model's
strict == lenient because it has **100% format compliance** (always emits a clean
`<answer>`), so there's nothing for lenient parsing to recover.

Sanity subset (first 300, `gsm8k_limit300.json`): base 60.3% → tuned 72.7% lenient —
consistent direction.

**ARC-Challenge — forgetting check** (200 questions, `arc.json`):
base **69.5% → 68.5%** tuned (−1.0 pt, within noise). Math RL did **not** degrade
general reasoning.

Contrast traces (base wrong / tuned right) in `docs/sample_traces.md`.

### Phase 5 — Quantize + export
Artifacts from the LoRA adapter (`export/`), merged onto **stock fp16 Qwen** (not the
4-bit base) via PEFT on CPU:
| Artifact | Path | Size |
|---|---|---|
| Merged fp16 (HF) | `export/merged_16bit/` | 3.09 GB |
| GGUF f16 | `export/gguf/…-f16.gguf` | 2.94 GB |
| **GGUF Q4_K_M** | `export/gguf/…-q4_k_m.gguf` | **0.93 GB** |

Q4_K_M is **3.15× smaller** than f16 (2945→935 MiB, 5.08 bits/weight). GGUF built
with self-built llama.cpp (CPU-only, no nvcc).

**Quality vs latency** (GSM8K test, first 100 held-out, greedy, seed 3407):
| Model | Backend | pass@1 | gen tok/s |
|---|---|---|---|
| fp16 merged | vLLM (RTX 5060 GPU) | **0.76** | 673.9 |
| f16 GGUF | llama.cpp (16-thread CPU) | **0.76** | 12.6 |
| Q4_K_M GGUF | llama.cpp (16-thread CPU) | **0.69** | 21.1 |

→ **Quantization costs ~7 pts pass@1** (0.76→0.69). f16 GGUF == fp16/vLLM (both
0.76) proves the drop is **4-bit quantization, not the backend**. (n=100 → ±~9 pts
95% CI; sign reliable, treat magnitude as "a few points.") Q4 is 1.7× faster than
f16 on the same CPU and fits under 1 GB — the point of shipping it. **AWQ
deliberately deferred** (autoawq conflicts with the Blackwell torch pins; not worth
env risk for a marginal batched-throughput number). Details: `export/QUANT_DELTA.md`.

### Phase 6 — Serving (two backends, provider-agnostic)
Single-stream latency (`eval/results/serve_*.json`):
| Backend | TTFT | decode tok/s |
|---|---|---|
| vLLM fp16 / GPU | 19.2 ms | 105.2 (674 batched) |
| Ollama Q4 / GPU | 139.0 ms | **227.8** |

Q4 out-decodes fp16 single-stream because it's bandwidth-bound (4× smaller weights).
- `serve/client.py` — **provider-agnostic** `ForgeClient` (vLLM → Ollama → hosted
  fallback), streaming, failover proven. Env: `FORGE_VLLM_URL`, `FORGE_OLLAMA_URL`,
  `FORGE_FALLBACK_URL/KEY/MODEL`.
- `serve/bench.py` (TTFT + decode), `serve/Modelfile` (Ollama Q4; needs abs path —
  `make serve-ollama` sed-rewrites it), `serve/README.md`.
- **Ollama installed user-space** (`~/ollama/bin/ollama`, v0.32.1, no sudo — tarball
  from GitHub releases; bundled CUDA v13 supports Blackwell, offloads 29/29 layers).
  Start: `make serve-vllm` / `~/ollama/bin/ollama serve` + `make serve-ollama`.

### Phase 7 — Docs
`README.md` (RL-across-domains lead, 10-sec results, reward-design writeup, curve,
quickstart) + `MODEL_CARD.md` (full config + every measured number + limits). Repo
scanned clean (no secrets/personal paths); build cruft gitignored.

### Phase 8 — Demo (see PART 3 for the working area)
Next.js/TypeScript app in `demo/`, side-by-side base vs GRPO-tuned with typewriter
reveal of **real cached outputs** (base **1/6**, tuned **5/6** on 6 curated
problems), results panel (pass@1 bars + reward curve), optional live-inference route.
Then deployed to Vercel and made public (PART 2).

---

# PART 2 — Deploy saga (Vercel) — problems solved, don't re-break

The demo went live only after fixing a stack of Vercel config issues. All fixed; the
fixes are committed. Reference so the next session doesn't undo them:

1. **App is in `demo/`, not repo root** → first deploy 404'd (built from root).
   Fix: Vercel project **Root Directory = `demo`** (set in dashboard).
2. **Vercel security gate** hard-blocks Next.js versions with known advisories →
   "Build Failed: Vulnerable version of Next.js." Fix: bumped **15.1.6 → 15.5.20**
   (latest patched 15.x; commit 5702e53). **Don't downgrade.**
3. **Framework Preset stuck at `null`** (detected when root still pointed at the
   app-less repo root) → Vercel ran `next build` but never wired up the Next.js
   serving layer, so **every route returned a platform 404 despite a green build**.
   This was the sneaky one — diagnosed via `vercel pull` showing `"framework": null`.
   Fix: **`demo/vercel.json` → `{"framework":"nextjs"}`** (commit f5a14ae). **Keep
   that file.** Production now returns 200.
4. **Deployment Protection is ON** → preview URLs (`forge-git-main-…`) 302-redirect
   to a Vercel login. The public `forge-iota-coral` alias is unaffected. To make
   preview links shareable: Vercel → Settings → Deployment Protection → disable
   Vercel Authentication. Optional.

**Verified live:** `/` → HTTP 200 with the app; `/api/generate` POST → 503 (correct:
no live endpoint → page uses cached outputs); `/reward_curve.png` → 200 (229 KB).

**Repo made public** 2026-07-18 via `gh api -X PATCH repos/pratyushpad/forge -f
visibility=public` (the `gh repo edit --visibility` flag was unrecognized in the
installed gh version). Secret scan clean before flip: no env/credential files, no
weights tracked.

---

# PART 3 — UI/UX handoff (your working area)

Your job now: **UI/UX design polish on the demo web app.** Don't retrain,
re-quantize, or touch the ML pipeline unless explicitly asked.

Stack: **Next.js 15.5.20 (App Router) · React 19 · TypeScript · plain hand-rolled
CSS** (no Tailwind, no component lib — deliberately dependency-light).

```
demo/
  app/
    page.tsx              ← MAIN component. All layout/interaction. useTypewriter
                            hook, ModelColumn, stat bar, example chips, side-by-side
                            grid, results panel, footer.
    globals.css           ← ALL styling. Color tokens in :root (bg/panel/ink/muted/
                            blue/green/red/amber). Dark-theme only. Responsive @720px.
    layout.tsx            ← <html> shell + metadata (title/description) + font.
    api/generate/route.ts ← Edge route for OPTIONAL live inference; 503 when no
                            endpoint → cached fallback. Ignore for pure UI work.
  public/
    examples.json         ← 6 real cached base-vs-tuned outputs the page replays.
                            Shape: { generated, examples:[{ question, gold,
                            models:{ base:{raw,reasoning,answer,correct}, tuned:{…} }}]}
    reward_curve.png      ← training reward curve shown in results panel.
  vercel.json             ← { "framework":"nextjs" } — DO NOT DELETE (gotcha #3).
  gen_examples.py         ← regenerates examples.json from real models via Ollama.
                            Only needed if you change which problems are shown.
  package.json, tsconfig.json, next.config.mjs, README.md
```

Design tokens: `demo/app/globals.css` `:root`. Blue = GRPO accent; green = correct;
red = wrong. Known UI opportunities (not mandates): dark-only (no light mode);
typewriter speed (`cps` in `useTypewriter`); the free-text input only fuzzy-matches
the 6 canned examples (affordance unclear); mobile one-column collapse at 720px;
plain results panel.

**Numbers currently shown in the UI (keep exact):** stat bar = GSM8K 58.8% → 70.0%,
ARC 69.5 → 68.5, 86 min / 3.64 GiB, 228 tok/s. Results panel = pass@1 bars 58.8% vs
70.0%, reward curve image. Footer = "Base 1/6 vs GRPO-tuned 5/6."

### Running locally
**No system Node/npm** — Node 22 is in a conda env, Bun in `~/.bun`. Put both on PATH:
```bash
export PATH="$HOME/.bun/bin:$HOME/miniconda3/envs/node/bin:$PATH"
cd ~/forge/demo
npm install          # first time only
npm run dev          # http://localhost:3000   (npm run build to check prod build)
```
WSL forwards localhost — open the URL in your Windows browser.

### Shipping changes
Vercel is **git-connected to `main`** — every push auto-deploys to production:
```bash
cd ~/forge && git add -A && git commit -m "..." && git push
```
Manual deploy (CLI is authed as `pratyushpad27`, team `pratyushpad27s-projects`):
```bash
export PATH="$HOME/.bun/bin:$HOME/miniconda3/envs/node/bin:$PATH"
cd ~/forge && vercel build --prod && vercel deploy --prebuilt --prod
```
Project **Root Directory = `demo`**, so build from repo root, not `demo/`. `.vercel/`
and `.env*` are gitignored (they hold pulled secrets) — never commit them.

---

# PART 4 — Environment notes (whole repo)

- **ML env:** conda env `forge` (Python 3.11). **Always `unset PYTHONPATH`** first —
  the user's shell leaks ROS2 Jazzy paths. Makefile uses
  `PY := PYTHONPATH=. $(HOME)/miniconda3/envs/forge/bin/python`. Not needed for UI.
- **Model schedule (original build):** Fable 5 ran phases 0–4, Opus 4.8 ran 5–8.
- **Weights** (`*.safetensors`, `*.gguf`) are gitignored, in `outputs/`/`export/`.
  The demo doesn't need them (uses cached JSON).
- **Ollama** has `qwen2.5:1.5b-instruct` (base) + `forge-q4` (tuned) if you ever want
  to regenerate `examples.json` via `demo/gen_examples.py`.
- **Vercel Claude Code plugin** is installed user-scope (all sessions):
  `npx plugins add vercel/vercel-plugin` → `vercel:*` skills and `/vercel-plugin:*`
  commands available. Required Bun (installed to `~/.bun`, no sudo).
- **Makefile targets:** test, data-stats, smoke-train, full-train, eval, export,
  quantize, serve-vllm, serve-ollama, bench.

### Résumé line (all numbers real)
> **Forge** — Trained Qwen2.5-1.5B to reason via **GRPO** (RL with verifiable
> rewards) on an 8 GB RTX 5060, lifting **GSM8K pass@1 58.8% → 70.0%** with no
> catastrophic forgetting (ARC 69.5% → 68.5%) in **86 min / 3.64 GiB peak VRAM**;
> quantized to **GGUF Q4_K_M (3.15× smaller)** and served at **105–228 tok/s** behind
> a provider-agnostic interface, plus a live Next.js demo. **RL across domains — PPO
> for robotic manipulation, GRPO for LLM reasoning.**
