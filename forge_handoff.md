# FORGE_HANDOFF — master handoff for the next Claude Code session

**Read this first, top to bottom.** It is the single source of truth for the Forge
project: everything built, everything measured, how the live endpoint actually
behaves, and what's genuinely left. It is self-contained — you should not need any
other file to get oriented — but it points to the deeper docs where useful.

- **Repo:** `/home/praty/forge` — public: https://github.com/pratyushpad/forge
- **Live site:** https://forge-iota-coral.vercel.app — **five pages, real GPU
  inference.** Not cached-only anymore.
- **Status:** the project is **feature-complete**. Both original milestones (live
  inference, multi-page site) shipped 2026-07-19. What remains is polish and
  verification — see §2.

### How to start this session
1. **Set your model.** Recommended: **Opus 4.8** (`/model`) — Next.js + Python + deploy.
2. Read §1 (the one rule) — non-negotiable.
3. Read §2 (current state) so you don't rebuild something that exists.
4. §5 has the live-endpoint operational facts. **Read it before touching
   `/api/generate`** — the cold-start handling there is subtle and easy to break.

---

## §1 — THE ONE RULE: never invent a number

Every metric on the site or in any doc must be a **measured, reproducible** value
from a committed, seeded (seed **3407**) script — never estimated, never rounded up,
never "about." This is a résumé project; **one fabricated number destroys its
credibility.** If a design or copy idea needs a stat we don't have, either measure it
with a real script or **ask the user** — do not fill it in. The canonical, allowed
numbers are the tables in §3. Nothing outside those tables may appear as a claim.

**Corollary — cached vs. live.** The site now shows both. Cached replays are labelled
as recorded; live runs are labelled as live. Never present one as the other. And note
the trap that already bit once: **a live single run can disagree with the recorded
set** (live base solved the seed-0 problem that `examples.json` records it failing).
That's honest and fine — but it means no page may imply that a live outcome *is* the
eval. The headline 58.8% → 70.0% comes from the 1,319-problem run, and `/playground`
says so in as many words.

---

## §2 — Current state

### Done and committed (everything below is live in production)
- **All 8 ML build phases** — complete, reproducible. Full record in **`HANDOFF.md`**
  and **`MODEL_CARD.md`**. Headline: **GSM8K pass@1 58.8% → 70.0%**, no forgetting.
- **Live Modal endpoint** — deployed and verified end-to-end from production. §5.
- **Five-page site** — `/`, `/playground`, `/method`, `/results`, `/traces`, with a
  shared sticky nav. §6.
- **`/api/generate`** — hardened (rate limit, allowlist, body guards, bearer, 503) and
  now cold-start-tolerant. The allowlist already includes `base` and `tuned`, and the
  route already sends the mandatory one-shot. §5.
- **Error surfaces** — `demo/app/error.tsx` and `not-found.tsx`, designed to the token
  system rather than Next's stock white page. Plus `sitemap.ts` / `robots.ts`.
- **README** — leads with the live playground and maps all five routes.

### Genuinely open (small, ranked)
1. **Nothing has been visually verified.** Every page was code-reviewed and
   content-verified via curl, but no one has *looked* at the site. Install a browser
   MCP (`claude mcp add playwright -- npx @playwright/mcp@latest`) and do a real pass
   at 375 / 768 / 1440 across all five routes. **This is the top of the list.**
2. **Per-route OG images.** Only the root has one (`app/opengraph-image.tsx`), so
   sharing `/results` shows the generic card.
3. **`docs/sample_traces.md` is the only trace source.** All five contrast cases are
   base-wrong/tuned-right by construction; `/traces` states this plainly and ships the
   double-miss to compensate. More traces would strengthen it, but this is not a defect.

### The strategic "why" (keep this in view)
The user is using this as a résumé centerpiece and was worried a **single polished
page** reads as "just a landing page," and that "6 canned prompts, no live model" is a
credibility ceiling. Both fixes have now shipped. Yardstick, always: *does a skeptical
ML engineer come away convinced?* The edge is **depth + rigor + honesty + live proof**
— not consumer polish. Resist adding features that trade rigor for shine.

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
+0.5 (+0.125 per tag present exactly once) · exact format +0.5 · numeric answer +0.25.

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

**Model schedule (history):** Fable 5 ran phases 0–4, Opus 4.8 ran 5–8 + redesign +
the live endpoint + the five-page site.

---

## §4 — Design system (Molten Industrial)

Established `a06c626` (full note in the user's memory `forge-demo-design-system.md`).
**Extend it; don't reinvent it.**

- **Theme:** forge / heat-treatment — "Forged to reason," cold base metal vs. the
  heat-treated tuned model. Keep this voice.
- **Tokens** (`demo/app/globals.css` `:root`): coal `#0C0A09` bg, **ember `#EF5411`**
  (brand + tuned series), **cold steel `#5B85D6`** (base series), status `--ok
  #4CC38A` / `--bad #F16969` **kept separate from series colors**. The base/tuned pair
  passed all six dataviz validator checks on the dark surface — **don't recolor the
  series without re-validating.** Status colors are reserved: never use `--ok`/`--bad`
  for an ungraded outcome (`/playground` uses `.vchip.warn`/`.neutral` for that).
- **Motion:** vocabulary in **`demo/lib/motion.ts`**, mirrored as `--dur-*`/`--ease-*`
  CSS vars. Every animation needs a `prefers-reduced-motion` fallback and must use
  transform/opacity (or clip-path) only. Display font **Archivo Black** via `next/font`.
- **Assets:** `public/forge-texture.webp` (generated anvil, hero bg w/ double scrim);
  `app/opengraph-image.tsx` (next/og 1200×630, numbers verbatim from §3);
  `public/reward_curve.png` (re-rendered in theme colors from the real
  `outputs/full/log_history.json` — data unchanged).
- **CLAUDE.md UI standards apply.** The global instructions require the
  `web-ui-standards` skill chain and generated imagery over stock. Note: the chain
  references a `review-animations` skill that **isn't installed** — do motion review
  manually against the `emil-design-eng` checklist + the reduced-motion rule.

---

## §5 — The live endpoint (deployed — read before touching `/api/generate`)

**Endpoint:** `https://pratyushpad--forge-vllm-serve.modal.run`
**OpenAI base URL:** that **+ `/v1`**
**Model ids:** exactly `base` and `tuned` — send those literal strings.

**Architecture:** one Modal serverless GPU container (T4) runs **vLLM's
OpenAI-compatible server** hosting `Qwen/Qwen2.5-1.5B-Instruct` as `base` with the
**GRPO LoRA adapter mounted as `tuned`** (vLLM multi-LoRA). One GPU, one process, both
models — mirrors training and avoids shuffling 3GB merged weights. Adapter lives on a
Modal Volume. App = `forge-vllm`; source `serve/modal_app.py`; guide
`serve/MODAL_DEPLOY.md`.

```
visitor → Vercel page → POST /api/generate {question, model:"base"|"tuned"}
        → Modal /v1/chat/completions (bearer FORGE_FALLBACK_KEY) → streamed trace back
```

### Three things that will bite you

**1. The one-shot is mandatory, not optional.** With the system prompt alone, *both*
models go free-form and emit no `<answer>` tags — confirmed against the real endpoint.
`route.ts` sends `SYSTEM` + the verbatim `ONE_SHOT` from `data/gsm8k.py`. Live
inference must use the prompt the eval harness used or the comparison is measuring
something else. **Don't "simplify" this away.**

**2. Cold start is ~60–90s, not the ~30s originally assumed.** Measured **68s** local,
**79s** through production. `scaledown_window` is **60s**, so the GPU sleeps after a
minute idle and cold-starts constantly. This exceeds the Vercel edge runtime's
initial-response budget, so the route **cannot** simply `await fetch(...)` and return
the body.

> **The shipped fix:** `/api/generate` opens the SSE stream *immediately*, emits
> `{forge_status:"waking"}` then `: keep-alive` comments every 2s while awaiting
> upstream, and pipes the real stream once it lands. Consequence: the HTTP status is
> committed to 200 the moment the stream opens, so **post-open failures are reported
> in-band as `{forge_error}`** — only pre-flight failures (no endpoint configured) can
> still return a real 503. `demo/lib/parse.ts` understands all three frame types.
>
> **A client-side retry loop is the wrong fix** and was rejected for this reason: each
> retry restarts the wake rather than waiting it out.

**3. Costs and protection.** Billing: card on file = **$30/month** credits (no card =
$1/month, so the card stays). Protection = a **workspace budget ≤ $30** which
hard-stops before any real charge. Idle cost is genuinely $0 (`modal app list` shows
`forge-vllm` deployed with 0 tasks). The `/api/generate` rate limit is in-memory *per
edge isolate*, so it's a speed bump, not a real control — **the budget cap is what
actually protects the wallet.** Acceptable posture for a portfolio piece; know that's
where the safety lives.

### Env vars
**Production (Vercel) is already set** — `FORGE_FALLBACK_URL`, `FORGE_FALLBACK_KEY`,
`FORGE_FALLBACK_MODEL=tuned`. Don't re-add them.

For **local** live testing, create `demo/.env.local` (gitignored — **never commit**)
with the same three keys. **The key is deliberately not written in this file: this
handoff is committed and the repo is public.** Retrieve it from the Vercel project
settings or the Modal secret `forge-api`.

### Gotchas already hit and fixed (don't re-debug these)
- `adapter_config.json` named a 4bit base → rewritten to `Qwen/Qwen2.5-1.5B-Instruct`
  in the volume copy.
- **T4 (cc 7.5) has no bfloat16** → `--dtype half` in `modal_app.py`.
- vLLM pinned `0.7.3`; if an image build fails, drop the pin and re-verify LoRA.
  `scaledown_window` is the current Modal arg name (older Modal: `container_idle_timeout`).

---

## §6 — The site as built

Five routes, shared `SiteNav` (sticky, `usePathname` active state) rendered in
`layout.tsx`. Plain CSS + tokens throughout — **no Tailwind, no component library.**
The project is deliberately dependency-light; keep it that way.

| route | what it is | client JS |
|---|---|---|
| `/` | hook: hero, stat bar, cached side-by-side, then four cards into the deeper pages | typewriter replay |
| `/playground` | **live** base-vs-tuned streaming inference on a typed problem | full |
| `/method` | GRPO explained, the reward stack to scale, the cold-start bug | none |
| `/results` | every figure with its committed source file | bars only |
| `/traces` | full unedited reasoning traces incl. the double-miss | none |

**Honesty rules baked into the pages — preserve these:**
- `/playground` grades ✓/✗ **only** for the six seed problems (gold known). A typed
  problem is ungraded: both answers shown, agreement/disagreement noted, **no winner
  declared.** `demo/lib/parse.ts` ports `extract_answer`/`normalize_number`/
  `answers_match` from `train/rewards.py` so live seed grading matches the eval rule.
- `/results` quotes **+11.2 lenient** (the harder comparison), not the flattering
  +15.6 strict, and states the n=100 confidence interval on the quantization table.
- `/traces` says outright that the five contrast cases were selected for disagreement
  and that the model scores 70%, not 100% — then ships the double-miss.
- `/` no longer duplicates `/results`; section 03 is now "Go deeper" link cards.

**Data generators** (both reshape committed sources; neither runs a model at build
time): `demo/gen_examples.py` → `public/examples.json`, `demo/gen_traces.py` →
`public/traces.json`.

---

## §7 — Repo map

```
forge/
  train/            train_grpo.py (GRPO+Unsloth+vLLM), rewards.py (reward fns)
  data/             gsm8k.py (loader, SYSTEM_PROMPT, ONE_SHOT, SEED=3407)
  eval/             eval_gsm8k.py, eval_arc.py, eval_served.py, plot_training.py
                    results/  ← committed eval JSON (source of every §3 number)
  export/           merge_lora.py, merged_16bit/ (3GB, gitignored), gguf/ (gitignored),
                    QUANT_DELTA.md
  outputs/full/     LoRA adapter (adapter_config.json + adapter_model.safetensors,
                    73MB) + checkpoint-100..750 + log_history.json   [gitignored]
  serve/            client.py (provider-agnostic), bench.py, Modelfile, README.md,
                    modal_app.py (live endpoint), MODAL_DEPLOY.md
  demo/             Next.js app — see §4/§6
    app/            page.tsx, layout.tsx, globals.css, error.tsx, not-found.tsx,
                    sitemap.ts, robots.ts, opengraph-image.tsx,
                    api/generate/route.ts, playground/, method/, results/, traces/,
                    _components/{SiteNav,ModelColumn,RevealBars}.tsx
    lib/            motion.ts (motion vocabulary), parse.ts (SSE + grading port)
    public/         examples.json, traces.json, reward_curve.png, forge-texture.webp
    gen_examples.py, gen_traces.py, vercel.json ({"framework":"nextjs"} — DO NOT DELETE)
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
does `PY := PYTHONPATH=. .../envs/forge/bin/python`. `pytest` lives in the `forge`
env, not base: `conda activate forge && python -m pytest tests/ -q` (7 tests).

**Web env (no system Node/npm):** Node 22 is in a conda env, Bun in `~/.bun`:
```bash
export PATH="$HOME/.bun/bin:$HOME/miniconda3/envs/node/bin:$PATH"
cd ~/forge/demo && npm install && npm run dev   # http://localhost:3000
npx tsc --noEmit && npm run build               # the gate before any commit
```
WSL forwards localhost — open in the Windows browser.

**Deploy:** Vercel is git-connected to `main` — `git push` auto-deploys (~45–60s).
Manual: `cd ~/forge && vercel build --prod && vercel deploy --prebuilt --prod` (CLI
authed as `pratyushpad27`, team `pratyushpad27s-projects`; not on PATH — use
`npx --yes vercel@latest`). Project **Root Directory = `demo`**.

**Modal:** CLI is in the conda **base** env (`~/miniconda3/bin/modal`), not `forge`.
`modal app list` to check state. Everything else in `serve/MODAL_DEPLOY.md`.

**Secrets — never commit:** `.env.local`, `.vercel/`, `.claude/settings.local.json`,
model weights (`*.safetensors`, `*.gguf`). All gitignored; never `git add -f` them.
**The repo is public** — run `handoff_checker.md` check A before any push that touches
config, and never paste key material into a tracked file.

---

## §9 — Open items and risks

- **Nothing has been visually verified.** See §2. Top priority.
- **Cold start is 60–90s and the endpoint sleeps after 60s idle.** If demoing live in
  an interview, **warm it first with a curl** — or temporarily set `min_containers=1`
  (burns credits continuously; revert after). Do not discover this in front of someone.
- **Rate limit is per edge isolate**, so distributed traffic bypasses it. The Modal
  budget cap is the real protection; worst case is the endpoint stopping, not a bill.
  Note only — don't over-engineer a portfolio demo.
- **In-band error frames.** Because the stream commits to 200 early, a failure after
  the stream opens arrives as `{forge_error}`, not an HTTP status. Anything new that
  consumes `/api/generate` must handle that frame or it will silently hang. §5.
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
> provider-agnostic interface, with a **live** Next.js demo running real base-vs-tuned
> inference on a scale-to-zero GPU. **RL across domains — PPO for robotic manipulation,
> GRPO for LLM reasoning.**

---

## §11 — Other docs (read when you need depth)
- **`HANDOFF.md`** — full 8-phase historical record, every table, the Vercel deploy saga.
- **`handoff_checker.md`** — verification runbook (run before claiming anything works).
- **`MODEL_CARD.md`** — complete config, numbers, limitations.
- **`serve/MODAL_DEPLOY.md`** — the exact live-deploy commands.
- **`export/QUANT_DELTA.md`** — quantization methodology + the quality-delta argument.
- **`docs/sample_traces.md`** — real base-wrong / tuned-right traces (source for `/traces`).
