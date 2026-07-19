# FORGE_HANDOFF — master handoff for the next Claude Code session

**Read this first, top to bottom.** It is the single source of truth for the Forge
project going forward: everything already built, everything measured, and the exact
work ahead. It is self-contained — you should not need any other file to get
oriented — but it points to the deeper docs where useful.

- **Repo:** `/home/praty/forge` — public: https://github.com/pratyushpad/forge
- **Live demo:** https://forge-iota-coral.vercel.app (currently cached-only; going live is the next milestone)
- **This session's job:** (1) deploy the model to a live Modal endpoint, then
  (2) expand the demo from one page into a multi-page project site. Details in §5–§7.

### How to start this session
1. **Set your model.** Recommended: **Opus 4.8** (`/model`) — this is build/coding
   work (Next.js pages + Python serving + deploy), Opus is the right tool.
2. Read §1 (the one rule) — it is non-negotiable.
3. Read §2 (current state) so you know what's done vs. pending.
4. Then §5 (tomorrow's deploy) and §6–§7 (the build).

---

## §1 — THE ONE RULE: never invent a number

Every metric on the site or in any doc must be a **measured, reproducible** value
from a committed, seeded (seed **3407**) script — never estimated, never rounded up,
never "about." This is a résumé project; **one fabricated number destroys its
credibility.** If a design or copy idea needs a stat we don't have, either measure it
with a real script or **ask the user** — do not fill it in. The canonical, allowed
numbers are the tables in §3. Nothing outside those tables may appear as a claim.

Corollary: the demo currently labels its outputs "**real cached outputs**." Keep that
honesty. When live inference lands, live results are real too — but never present
cached as live or vice versa.

---

## §2 — Current state (what's done, what's pending)

### Done and committed
- **All 8 ML build phases** (train → eval → quantize → serve → docs) — complete,
  committed, reproducible. Full record + every number in **`HANDOFF.md`** and
  **`MODEL_CARD.md`**. Headline: **GSM8K pass@1 58.8% → 70.0%**, no forgetting.
- **Demo shipped & public** on Vercel, git-connected to `main` (auto-deploys on push).
- **Molten Industrial redesign** of the demo landing page — committed **`a06c626`**.
  Forge/heat-treatment theme, ember-vs-cold-steel palette, motion system in
  `demo/lib/motion.ts`, generated anvil texture, OpenGraph card. See §4.
- **`/api/generate` is already hardened** — rate limiting (10/min per IP), JSON-body
  guard (400), model allowlist, upstream bearer auth, 503 fallback to cached. You do
  **not** need to add these; you only need to widen the allowlist (see §6, step B).

### Built today, NOT yet committed (commit these early this session)
- `serve/modal_app.py` — the Modal serverless GPU serving app (base + LoRA). §5.
- `serve/MODAL_DEPLOY.md` — exact copy-paste deploy commands for the live endpoint.
- `forge_handoff.md` — this file.

Run `git add serve/modal_app.py serve/MODAL_DEPLOY.md forge_handoff.md && git commit`
once you've read them. (`.claude/` is untracked on purpose — leave it.)

### Pending (this session's work)
1. **Live endpoint** — user deploys Modal (has signed up). You guide + verify. §5.
2. **Multi-page site** — `/playground` (live), `/method`, `/results`, `/traces`. §6.

### The strategic "why" (the user's actual concern)
The user is using this as a résumé centerpiece and worried a **single polished page**
reads as "just a landing page," and that "6 canned prompts, no live model" is a
credibility ceiling. The two fixes, in priority order:
1. **Make inference live** (any visitor types any problem, both models reason in real
   time) — kills the "cherry-picked" doubt.
2. **Go multi-page** (method / results / traces as real chapters) — turns it into a
   research artifact with visible depth, not a landing page.
Yardstick, always: *does a skeptical ML engineer come away convinced?* This is **not**
competing with a consumer product — it's a portfolio piece whose edge is **depth +
rigor + honesty + live proof**, versus e.g. a common CV project.

---

## §3 — The canonical numbers (the ONLY stats allowed on the site)

All greedy (temperature=0), seed 3407. Sources are committed under `eval/results/`.

**GSM8K — full 1,319 held-out test set (the headline):**
| | strict | lenient |
|---|---|---|
| base | 54.36% | **58.83%** |
| GRPO-tuned | **69.98%** | **69.98%** |

→ **58.8% → 70.0%** (+11.2 pts lenient, +15.6 strict). Tuned strict==lenient because
it has **100% format compliance**.

**ARC-Challenge — forgetting check (200 questions):** base **69.5% → 68.5%** tuned
(−1.0 pt, within noise). Math RL did not degrade general reasoning.

**Training (Phase 3):** 750 steps × 8 generations, seed 3407. **86.2 min wall-clock,
3.64 GiB peak VRAM** (of ~6.6 usable on the 8GB RTX 5060). **Mean group reward
1.23 → 2.80** (of max 3.25). KL to base ~0.05, completion length flat ~180 tok (no
length hacking).

**Reward design (max 3.25/completion):** correctness +2.0 · tag presence graded up to
+0.5 · exact format +0.5 · numeric answer +0.25.

**Quantization (GSM8K first 100 held-out, greedy):**
| Model | Backend | pass@1 | gen tok/s |
|---|---|---|---|
| fp16 merged | vLLM (GPU) | 0.76 | 673.9 |
| f16 GGUF | llama.cpp (CPU) | 0.76 | 12.6 |
| Q4_K_M GGUF | llama.cpp (CPU) | 0.69 | 21.1 |

→ Q4 costs ~7 pts, is **3.15× smaller (0.93 GB)**. f16 GGUF == fp16/vLLM confirms the
drop is quantization, not backend. (n=100 → ±~9 pts 95% CI; treat magnitude loosely.)

**Serving single-stream:** vLLM fp16/GPU TTFT 19.2 ms, 105 tok/s (674 batched);
Ollama Q4/GPU TTFT 139 ms, **227.8 tok/s**.

**Demo examples:** on the 6 curated problems, **base 1/6, tuned 5/6** (one is an
honest double-miss where both are wrong — keep it; it signals we don't cherry-pick).

**Model schedule (history):** Fable 5 ran phases 0–4, Opus 4.8 ran 5–8 + redesign.

---

## §4 — The redesign (Molten Industrial) — what's on the page now

Committed `a06c626`. Design system (full note in the user's memory
`forge-demo-design-system.md`):
- **Theme:** a forge / heat-treatment metaphor — "Forged to reason," cold base metal
  vs. the heat-treated tuned model, "Cold metal vs. forged." Keep this voice.
- **Tokens** (`demo/app/globals.css` `:root`): coal `#0C0A09` bg, **ember `#EF5411`**
  (brand + tuned series), **cold steel `#5B85D6`** (base series), status `--ok
  #4CC38A` / `--bad #F16969` (kept separate from series colors). The base/tuned pair
  passed all six dataviz validator checks on the dark surface — **don't recolor the
  series without re-validating.**
- **Motion:** vocabulary in **`demo/lib/motion.ts`**, mirrored as `--dur-*`/`--ease-*`
  CSS vars. Every animation must have a `prefers-reduced-motion` fallback and use
  transform/opacity only. Display font **Archivo Black** via `next/font` (self-hosted,
  no runtime request).
- **Assets:** `demo/public/forge-texture.webp` (generated anvil-with-ember-cracks,
  hero background w/ double scrim); `demo/app/opengraph-image.tsx` (next/og 1200×630,
  numbers verbatim from §3); `demo/public/reward_curve.png` (re-rendered in theme
  colors from the real `outputs/full/log_history.json` — data unchanged).
- **`page.tsx` structure today:** hero + stat bar → `01 · Pick a problem` (example
  chips) → `02 · Side by side` (two ModelColumns w/ typewriter reveal + verdict bar)
  → `03 · The proof` (pass@1 bars, ARC bars, reward curve). `useTypewriter`,
  `useInView`, `cleanAnswer` (renders unparseable answers as "—", never "null").
- **CLAUDE.md UI standards apply.** The user's global instructions require the
  `web-ui-standards` skill chain and generated imagery over stock. Note: the chain
  references a `review-animations` skill that **isn't installed** — do motion review
  manually against the `emil-design-eng` checklist + the reduced-motion rule.

---

## §5 — TOMORROW: deploy the live endpoint (Modal)

Full copy-paste guide: **`serve/MODAL_DEPLOY.md`**. Summary of the design:

**Architecture:** one Modal serverless GPU container runs **vLLM's OpenAI-compatible
server** hosting `Qwen/Qwen2.5-1.5B-Instruct` (served as model id `base`) with the
**GRPO LoRA adapter mounted as model id `tuned`** (vLLM multi-LoRA). One GPU, one
process, both models. **Scale-to-zero** → **$0 when idle**, ~20–40s cold start.

```
visitor → Vercel page → POST /api/generate {question, model:"base"|"tuned"}
        → Modal /v1/chat/completions (bearer FORGE_FALLBACK_KEY) → streamed trace back
```

**Why LoRA-as-adapter:** the tuned model literally *is* a 73MB LoRA on the base
(`outputs/full/adapter_config.json` + `adapter_model.safetensors`), so this mirrors
training and avoids shuffling 3GB merged weights. The adapter goes on a Modal Volume.

**The user's decisions (locked):** host = **Modal**, real GPU, scale-to-zero → $0
idle. Billing: with a card on file the account gets **$30/month** credits (no card =
only $1/month, so the card stays). Protection against real charges = a **workspace
budget set to ≤ $30** (dashboard → Usage & Billing → "Set a budget"), which hard-stops
apps at/below the free-credit line before any charge triggers. Their local RTX 5060 is
**not** involved — it only did training; serving is entirely on Modal's GPU.

**Your role tomorrow:** walk the user through `serve/MODAL_DEPLOY.md` (install CLI →
`modal token new` → set spend cap → `modal secret create forge-api` → upload adapter
to volume → `modal deploy` → **verify with curl that base ≠ tuned on a fresh
problem** → set Vercel envs `FORGE_FALLBACK_URL` (with `/v1`), `FORGE_FALLBACK_KEY`,
`FORGE_FALLBACK_MODEL=tuned`). Known risk: the adapter config may name a 4bit base;
if `tuned` errors, fix `base_model_name_or_path` and re-upload (guide covers it).

**Verify (the user explicitly wanted a way to trust it):** curl the endpoint directly,
confirm `tuned` solves a problem `base` flubs; wait 6 min and curl again to confirm it
cold-started (proof of scale-to-zero / $0 idle). This *is* the verification — live,
arbitrary problems, no cherry-picking possible.

---

## §6 — THE BUILD: multi-page site expansion

Turn the single page into a **5-page project site**. Each page draws on work already
done — you are *surfacing* depth, not inventing it. All numbers from §3 only.

### The five routes
1. **`/`** — keep the redesigned landing (hook + headline + side-by-side). Trim if it
   overlaps with the new pages; it's the entry point / TL;DR.
2. **`/playground`** — **the live page.** Free-text input → calls `/api/generate`
   twice (once `model:"base"`, once `model:"tuned"`) → streams both reasoning traces
   side by side. This is the single highest-impact addition. Needs §5 deployed.
   - **Cold-start UX:** first request may take ~30s. Show an intentional "stoking the
     forge… (~30s, first run)" state, not a dead spinner. Reuse the typewriter reveal.
   - Keep the 6 cached examples as instant seed/fallback so the page is never empty
     (and works if the endpoint is asleep or the user hasn't deployed yet → 503).
3. **`/method`** — how it works: GRPO explained plainly, the **reward function design**
   (§3), the **cold-start bug + fix** (base got math right but ignored format → 0
   reward → no gradient; fixed with a one-shot example + graded tag reward — this is
   the best story in the project, see `HANDOFF.md` Phase 2), the 8GB-card setup. This
   page proves understanding, not just "ran a script."
4. **`/results`** — the evidence: GSM8K bars, ARC no-forgetting, reward curve, the
   quantization quality/size/speed table (§3). Rigor on display.
5. **`/traces`** — a gallery of real base-wrong / tuned-right reasoning traces. Source:
   `docs/sample_traces.md` (5 contrast traces) and/or `demo/public/examples.json`.
   Receipts, not claims.

### Two code changes the live path needs
**A. Nav + routing.** Add a shared header/nav across the App Router routes. Keep the
design tokens and motion system; don't introduce a component library (the project is
deliberately dependency-light — plain CSS).

**B. Widen the `/api/generate` allowlist.** Today it allows `["forge",
FORGE_FALLBACK_MODEL]` and forwards a single `model`. The playground needs **both**
`"base"` and `"tuned"`. Update the allowlist to include both, keep the "never forward
an arbitrary user string upstream" clamp, and have the playground make two calls. The
route already streams SSE and is otherwise hardened — minimal change.

### Order of work
Playground first (highest leverage, and it validates the Modal deploy end-to-end),
then `/method`, `/results`, `/traces`. Commit page-by-page; each push auto-deploys.

---

## §7 — Repo map (where everything lives)

```
forge/
  train/            train_grpo.py (GRPO+Unsloth+vLLM), rewards.py (reward fns)
  data/             gsm8k.py (loader, SYSTEM_PROMPT, one-shot, SEED=3407)
  eval/             eval_gsm8k.py, eval_arc.py, eval_served.py, plot_training.py
                    results/  ← committed eval JSON (source of every §3 number)
  export/           merge_lora.py, merged_16bit/ (3GB, gitignored), gguf/ (gitignored),
                    QUANT_DELTA.md
  outputs/full/     LoRA adapter (adapter_config.json + adapter_model.safetensors,
                    73MB) + checkpoint-100..750 + log_history.json   [gitignored]
  serve/            client.py (provider-agnostic), bench.py, Modelfile, README.md,
                    modal_app.py ← NEW (live endpoint), MODAL_DEPLOY.md ← NEW
  demo/             Next.js app (see §4). app/page.tsx, app/globals.css, app/layout.tsx,
                    app/api/generate/route.ts, app/opengraph-image.tsx, lib/motion.ts,
                    public/{examples.json,reward_curve.png,forge-texture.webp},
                    vercel.json ({"framework":"nextjs"} — DO NOT DELETE)
  docs/             PHASE0_ENV.md, sample_traces.md, reward_curve.png
  HANDOFF.md        full historical record (8 phases, every number, deploy saga)
  handoff_checker.md verification runbook (secrets, tests, data, API, git hygiene)
  MODEL_CARD.md     full config + measured numbers + limits
  README.md         public-facing writeup
  forge_handoff.md  THIS FILE
  Makefile          test, full-train, eval, export, quantize, serve-*, bench
```

---

## §8 — Environment & commands (don't relearn these the hard way)

**ML env (Python):** conda env `forge` (Python 3.11). **Always `unset PYTHONPATH`
first** — the shell leaks ROS2 Jazzy paths that break imports. The Makefile already
does `PY := PYTHONPATH=. .../envs/forge/bin/python`.

**Web env (no system Node/npm):** Node 22 is in a conda env, Bun in `~/.bun`:
```bash
export PATH="$HOME/.bun/bin:$HOME/miniconda3/envs/node/bin:$PATH"
cd ~/forge/demo && npm install && npm run dev   # http://localhost:3000
npm run build                                    # verify prod build + typecheck
```
WSL forwards localhost — open in the Windows browser.

**Deploy the demo:** Vercel is git-connected to `main` — `git push` auto-deploys.
Manual: `cd ~/forge && vercel build --prod && vercel deploy --prebuilt --prod` (CLI
authed as `pratyushpad27`, team `pratyushpad27s-projects`). Project **Root Directory =
`demo`** (build from repo root). `.vercel/` and `.env*` are gitignored — **never
commit them** (real secrets).

**Modal (live endpoint):** `pip install modal` in the `forge` env, `modal token new`.
Everything else is in `serve/MODAL_DEPLOY.md`.

**Secrets — never commit:** `.env.local` (VERCEL_OIDC_TOKEN), `.vercel/`,
`.claude/settings.local.json`, model weights (`*.safetensors`, `*.gguf`). All are
gitignored; never `git add -f` them. Run `handoff_checker.md` check A if unsure.

---

## §9 — Open items, risks, what's missing

- **Modal LoRA compat (verify at deploy):** the Unsloth adapter was trained on a 4bit
  base; vLLM loads it onto fp16 `Qwen/Qwen2.5-1.5B-Instruct`. Standard r=16 targets
  (q,k,v,o,gate,up,down) are vLLM-supported, but confirm `tuned` actually loads (§5).
  Fallback: serve `export/merged_16bit/` as a full second model instead of a LoRA.
- **vLLM version pin** in `modal_app.py` is `0.7.3`; if the image build fails, drop the
  pin and re-verify LoRA. `scaledown_window` is the current Modal arg name; older
  Modal uses `container_idle_timeout`.
- **Cold start vs. demo feel:** ~20–40s first hit. If showing it live in an interview,
  either warm it first with a curl, or temporarily set `min_containers=1` (burns
  credits continuously — revert after).
- **`/api/generate` rate limit** is in-memory per edge isolate — fine for a portfolio
  demo, not for real traffic. Note only; don't over-engineer.
- **AWQ** deliberately deferred (conflicts with Blackwell torch pins) — documented, not
  a gap. Don't chase it.
- **`review-animations` skill** referenced in the user's CLAUDE.md isn't installed — do
  motion review manually.

---

## §10 — Positioning & résumé line (keep this framing in copy)

**RL across domains** — Forge is the LLM half of a pair with **PPO for robotic
manipulation** (99% target-reach, TCS Medical Robotics). Same RL backbone, two action
spaces: continuous robot control vs. discrete token generation. Keep this framing.

> **Forge** — Trained Qwen2.5-1.5B to reason via **GRPO** (RL with verifiable rewards,
> no SFT/human labels) on an 8 GB RTX 5060, lifting **GSM8K pass@1 58.8% → 70.0%** with
> no catastrophic forgetting (ARC 69.5% → 68.5%) in **86 min / 3.64 GiB peak VRAM**;
> quantized to **GGUF Q4_K_M (3.15× smaller)**, served at **105–228 tok/s** behind a
> provider-agnostic interface, with a **live** Next.js demo. **RL across domains — PPO
> for robotic manipulation, GRPO for LLM reasoning.**

---

## §11 — Other docs (read when you need depth)
- **`HANDOFF.md`** — full 8-phase historical record, every table, the Vercel deploy saga.
- **`handoff_checker.md`** — verification runbook (run before claiming anything works).
- **`MODEL_CARD.md`** — complete config, numbers, limitations.
- **`serve/MODAL_DEPLOY.md`** — the exact live-deploy commands.
- **`export/QUANT_DELTA.md`** — quantization methodology + the quality-delta argument.
- **`docs/sample_traces.md`** — real base-wrong / tuned-right traces (source for `/traces`).
