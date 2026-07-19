# handoff_checker.md — Forge verification & QA runbook

Companion to `HANDOFF.md`. Where `HANDOFF.md` records **what** was built, this file
is how you **verify it's all correct and safe** — every check is a runnable command
with its expected output, so a fresh session (or a reviewer) can confirm the codebase,
the data, the model results, the live site, and API security are intact.

- **Last full verification:** 2026-07-18, commit `c0af1b2`, branch `main`.
- **Result: ALL CHECKS PASS** (baseline snapshot below).
- **Repo:** `/home/praty/forge` — public: https://github.com/pratyushpad/Forge
- **Live:** https://forge-iota-coral.vercel.app

## How to use this file
Run the checks in order (A→G). Each shows the command and the **expected** output. If
any actual output differs from expected, that's a regression — stop and investigate
before shipping. Prereqs:
```bash
# ML checks: conda env `forge`, ALWAYS unset PYTHONPATH first (shell leaks ROS2 paths)
unset PYTHONPATH
# Node/demo checks: no system Node — put conda Node 22 + Bun on PATH
export PATH="$HOME/.bun/bin:$HOME/miniconda3/envs/node/bin:$PATH"
```

---

## Full directory tree (top to bottom, source only)

Excludes: `.git/`, `node_modules/`, `.next/`, `.vercel/`, `__pycache__/`,
`outputs/` (adapter+checkpoints), `export/merged_16bit/*.safetensors`,
`export/gguf/*.gguf` (weights — all gitignored).

```
forge/
├── FORGE_MASTER_HANDOFF.md      # original phase-gated build plan (tracked, public)
├── HANDOFF.md                   # full project record + UI/UX handoff
├── handoff_checker.md           # THIS FILE — verification runbook
├── README.md                    # public landing: RL-across-domains, results, quickstart
├── MODEL_CARD.md                # full config + every measured number + limits
├── Makefile                     # test/train/eval/export/quantize/serve/bench targets
├── .gitignore                   # ignores weights, .vercel, .env*, caches, local settings
│
├── data/
│   ├── __init__.py
│   └── gsm8k.py                 # loader, SYSTEM_PROMPT, one-shot, SEED=3407, gold parser
│
├── train/
│   ├── __init__.py
│   ├── rewards.py               # reward fns (max 3.25): correctness/format/numeric/tags
│   └── train_grpo.py            # GRPOTrainer + Unsloth, vLLM colocate, LoRA r16 a32
│
├── tests/
│   └── test_rewards.py          # 7 unit tests (reward logic)
│
├── eval/
│   ├── eval_gsm8k.py            # base vs tuned pass@1 (strict/lenient) + contrast traces
│   ├── eval_arc.py              # ARC-Challenge forgetting check
│   ├── eval_fp16_vllm.py        # fp16 merged, vLLM GPU quality+throughput
│   ├── eval_gguf.py             # GGUF quality via llama.cpp
│   ├── eval_served.py           # OpenAI-compat served eval (reused by serve phase)
│   ├── plot_training.py         # reward curve -> docs/reward_curve.png
│   └── results/                 # ← committed measured outputs (the source of truth)
│       ├── gsm8k.json           #   full 1319: base 58.8% -> tuned 70.0% (lenient)
│       ├── gsm8k_limit300.json  #   300-subset sanity
│       ├── arc.json             #   200: 69.5% -> 68.5%
│       ├── served_fp16_merged.json  # pass@1 0.76, 673.9 tok/s (vLLM GPU)
│       ├── served_f16_gguf.json     # pass@1 0.76, 12.6 tok/s (CPU)
│       ├── served_q4_k_m.json       # pass@1 0.69, 21.1 tok/s (CPU)
│       ├── serve_vllm-fp16.json     # TTFT 19.2ms, 105.2 tok/s
│       └── serve_ollama-q4.json     # TTFT 139.0ms, 227.8 tok/s
│
├── export/
│   ├── merge_lora.py            # PEFT merge LoRA -> stock fp16 Qwen (CPU)
│   ├── QUANT_DELTA.md           # sizes + quality-vs-latency table + AWQ deferral
│   └── merged_16bit/            # tokenizer/config JSON tracked; *.safetensors gitignored
│
├── serve/
│   ├── client.py               # provider-agnostic ForgeClient (vLLM->Ollama->fallback)
│   ├── bench.py                # TTFT + decode tok/s
│   ├── Modelfile               # Ollama Q4 def (abs path; serve-ollama sed-rewrites)
│   └── README.md               # serving docs (measured numbers)
│
├── docs/
│   ├── PHASE0_ENV.md           # GPU, versions, smoke-test VRAM
│   ├── sample_traces.md        # base-wrong / tuned-right contrast traces
│   └── reward_curve.png        # training reward curve
│
└── demo/                       # ← Next.js app (the live demo)
    ├── app/
    │   ├── page.tsx            # MAIN UI: typewriter, ModelColumn, statbar, results
    │   ├── globals.css         # ALL styling; color tokens in :root; dark-only
    │   ├── layout.tsx          # html shell + metadata
    │   └── api/generate/route.ts   # edge live-inference proxy (503 when unset)
    ├── public/
    │   ├── examples.json       # 6 REAL cached outputs (base 1/6, tuned 5/6)
    │   └── reward_curve.png
    ├── gen_examples.py         # regenerate examples.json via Ollama
    ├── vercel.json             # {"framework":"nextjs"} — DO NOT DELETE
    ├── package.json            # next 15.5.20, react 19
    ├── package-lock.json, tsconfig.json, next.config.mjs, next-env.d.ts
    └── README.md

Untracked-but-present (correctly gitignored — must NEVER be committed):
  .env.local                    # Vercel CLI: holds VERCEL_OIDC_TOKEN (secret)
  .vercel/                      # Vercel link + pulled prod env vars (secrets)
  .claude/settings.local.json   # machine-specific
  outputs/                      # LoRA adapter + checkpoint-100..600 (weights)
  export/gguf/*.gguf, export/merged_16bit/*.safetensors  # weights
  unsloth_compiled_cache/, grpo_trainer_lora_model/, .pytest_cache/  # caches
```

---

## A. Secret / leak verification (run before every push, and before anything goes public)

```bash
cd ~/forge
# A1 secrets/creds NOT tracked
git ls-files --error-unmatch .env.local 2>/dev/null && echo "FAIL: .env.local tracked" || echo "OK"
git ls-files --error-unmatch .claude/settings.local.json 2>/dev/null && echo "FAIL" || echo "OK"
# A2 no credential or weight files tracked
git ls-files | grep -iE "\.env|\.pem|\.key$|credential|secret|\.safetensors|\.gguf|\.bin$|\.pt$|\.pth$" || echo "OK: none"
# A3 no key material in tracked source
git grep -inE "(sk-[a-zA-Z0-9]{20}|ghp_[a-zA-Z0-9]{20}|xox[baprs]-|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC|PRIVATE))" -- . ':!*.md' ':!*lock.json' || echo "OK: clean"
```
**Expected:** every line `OK`. **Verified 2026-07-18: PASS.**
- `.env.local` holds a real `VERCEL_OIDC_TOKEN` and is correctly untracked (ignored by
  `.env*`). `.vercel/` (pulled prod env) ignored. No weights, no key material in git.
- ⚠️ **If you ever run `vercel pull` / `vercel link`, they write secrets to `.env.local`
  and `.vercel/`. Confirm both stay gitignored (they are) — never `git add -f` them.**

---

## B. Unit tests (reward logic — the core of the RL correctness)

```bash
cd ~/forge && unset PYTHONPATH
PYTHONPATH=. ~/miniconda3/envs/forge/bin/python -m pytest tests/ -q
# or: make test
```
**Expected:** `7 passed`. **Verified 2026-07-18: `7 passed in 3.14s`.**
These cover `answers_match`, `extract_answer`, `normalize_number`, and each reward
function. If reward logic is edited, these MUST stay green — a broken reward silently
corrupts any future training run.

---

## C. Live site + API security

```bash
# C1 page serves
curl -sS -o /dev/null -w "GET / : %{http_code}\n" https://forge-iota-coral.vercel.app/
# C2 transport security header
curl -sS -D - -o /dev/null https://forge-iota-coral.vercel.app/ | grep -i strict-transport
# C3 API with no endpoint set => clean 503, NOT a 500 / stack trace
curl -sS -X POST -H 'content-type: application/json' -d '{"question":"2+2","model":"forge"}' \
  -w "\n%{http_code}\n" https://forge-iota-coral.vercel.app/api/generate
```
**Expected / Verified 2026-07-18:**
- C1 → `200`
- C2 → `strict-transport-security: max-age=63072000; includeSubDomains; preload`
- C3 → `{"error":"no live endpoint configured"}` + `503` (graceful, no internals leaked)

### API security review — `demo/app/api/generate/route.ts`
Current posture (edge runtime proxy, live mode is OFF by default):
- ✅ **No SSRF:** upstream URL comes from **env only** (`FORGE_FALLBACK_URL` /
  `FORGE_VLLM_URL`), never from the request body. A caller cannot redirect the proxy.
- ✅ **No secret leakage:** `FORGE_FALLBACK_KEY` is sent as a bearer token *upstream
  only*; it is never returned to the client. Errors return a generic message (upstream
  failures return a generic 502, never the upstream body).
- ✅ **Fails safe:** with no endpoint configured it returns 503 and the page falls
  back to cached outputs — the default public state.
- ✅ **Hardening applied 2026-07-18** (all four former TODOs):
  1. **Rate limiting:** fixed-window in-memory limiter, 10 req/min per IP
     (`x-forwarded-for`), returns 429 `{"error":"rate limit exceeded"}`. Per edge
     isolate — enough for casual abuse; use a KV-backed limiter or shared secret if
     live mode ever sees real traffic.
  2. **`model` clamped to an allowlist** (`forge` + `FORGE_FALLBACK_MODEL`); anything
     else falls back to the default — arbitrary user strings never reach the backend.
  3. **Body parsing guarded:** non-JSON → 400 `{"error":"invalid JSON body"}`;
     `question` must be a non-empty string ≤ 2000 chars → else 400.
  4. **Security headers** via `next.config.mjs` `headers()` on all routes:
     `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
     `Referrer-Policy: strict-origin-when-cross-origin` (plus platform HSTS).
- ⚠️ **Verifier note:** hammering `/api/generate` more than 10×/min now returns 429
  instead of 503 — run check C3 as a single request.

---

## D. Data integrity (results match every claim shown to users)

```bash
cd ~/forge && unset PYTHONPATH
~/miniconda3/envs/forge/bin/python - <<'PY'
import json
ex = json.load(open("demo/public/examples.json"))["examples"]
b = sum(e["models"]["base"]["correct"] for e in ex); t = sum(e["models"]["tuned"]["correct"] for e in ex)
print(f"examples.json: {len(ex)} problems | base {b}/{len(ex)} | tuned {t}/{len(ex)}")
assert all({"question","gold","models"} <= set(e) for e in ex), "missing fields"
g = json.load(open("eval/results/gsm8k.json")); a = json.load(open("eval/results/arc.json"))
print(f"GSM8K lenient: {g['base']['lenient']*100:.1f}% -> {g['tuned']['lenient']*100:.1f}%")
print(f"ARC: {a['base']*100:.1f}% -> {a['tuned']*100:.1f}%")
PY
```
**Expected / Verified 2026-07-18:**
- `examples.json: 6 problems | base 1/6 | tuned 5/6` (matches the demo footer)
- `GSM8K lenient: 58.8% -> 70.0%` (matches README/UI headline)
- `ARC: 69.5% -> 68.5%` (matches forgetting claim)
- No missing fields.

**Rule:** if you edit any UI number or `examples.json`, re-run this — the page must
never show a value that isn't backed by `eval/results/*.json`.

---

## E. Demo build / typecheck

```bash
export PATH="$HOME/.bun/bin:$HOME/miniconda3/envs/node/bin:$PATH"
cd ~/forge/demo
node -e "console.log('next',require('./package.json').dependencies.next,'react',require('./package.json').dependencies.react,'framework',require('./vercel.json').framework)"
npx tsc --noEmit && echo "TS OK"
npm run build          # full prod build
```
**Expected / Verified 2026-07-18:**
- `next 15.5.20 react 19.0.0 framework nextjs`
- `TS OK` (no type errors)
- `npm run build` → compiles, routes `/`, `/_not-found`, `/api/generate`, ~107 kB first
  load. (Earlier verified.)

**Regression guardrails (deploy-breakers — see HANDOFF.md Part 2):**
- `demo/vercel.json` must exist with `"framework":"nextjs"` (else platform 404 despite
  a green build).
- Next.js must stay on a patched version (Vercel security gate blocks vulnerable ones).
- Vercel project **Root Directory = `demo`** (dashboard setting).

---

## F. ML reproducibility (optional — needs GPU/env; the "was the process correct" checks)

These regenerate the headline numbers from committed, seeded scripts. Slow; run when
you need to prove reproducibility, not every session.
```bash
cd ~/forge && unset PYTHONPATH
make eval        # eval_gsm8k + eval_arc, greedy seed 3407 -> writes eval/results/*.json
# training (full run ~86 min): make full-train   (750 steps x 8 gens)
# quantize/export: make export                     (merge -> GGUF f16 -> Q4_K_M)
```
**Correctness invariants to confirm the RL actually worked (not reward-hacked):**
- Reward rose (1.23 → 2.80) **and** held-out GSM8K accuracy rose (58.8 → 70.0) **and**
  completion length stayed flat (~180 tok) **and** ARC didn't collapse (69.5 → 68.5).
  All four together = genuine learning, not gaming. (See `docs/sample_traces.md`.)
- Tuned strict == lenient (both 70.0%) because format compliance is 100% — expected.
- Seed is fixed at **3407** everywhere; greedy decoding (temperature=0) for eval.

---

## G. Repo / GitHub hygiene

```bash
cd ~/forge
git status --short                 # expect: clean (nothing uncommitted you didn't intend)
git branch --show-current          # expect: main
gh repo view pratyushpad/Forge --json visibility,url   # expect: PUBLIC
git log --oneline -5               # expect: c0af1b2 HANDOFF at/near HEAD
```
**Verified 2026-07-18:** branch `main`, remote `github.com/pratyushpad/Forge`, visibility
**PUBLIC**, working tree clean.
- Note: `export/merged_16bit/` **tokenizer/config JSON files are tracked** (small text,
  no weights) — harmless and intentional (lets others rebuild the tokenizer). The
  `.safetensors` weights are gitignored. Not a leak.
- `FORGE_MASTER_HANDOFF.md`, `HANDOFF.md`, `handoff_checker.md` are all tracked and now
  **public** — they contain no secrets (verified by check A), only project narrative.
  If you'd rather the internal handoffs not be public, `git rm --cached` them.

---

## Known-good baseline snapshot (2026-07-18, commit c0af1b2)

| Check | Expected | Status |
|---|---|---|
| A. Secrets/leaks | no secrets/weights tracked; `.env.local`+`.vercel/` ignored | ✅ PASS |
| B. Unit tests | 7 passed | ✅ PASS |
| C. Live site | `/` 200, HSTS set | ✅ PASS |
| C. API | 503 clean (no live endpoint), no SSRF, key not leaked | ✅ PASS |
| D. Data integrity | examples 1/6 & 5/6; GSM8K 58.8→70.0; ARC 69.5→68.5 | ✅ PASS |
| E. Demo build | next 15.5.20/react 19; TS clean; build OK; vercel.json framework=nextjs | ✅ PASS |
| G. Git/GitHub | branch main, tree clean, repo PUBLIC | ✅ PASS |

### The measured numbers everything must agree with (source: `eval/results/*.json`)
- GSM8K pass@1 (1,319 held-out, greedy, seed 3407): base **58.83%** lenient /
  **54.36%** strict → tuned **69.98%** (strict == lenient).
- ARC-Challenge (200): base **69.5%** → tuned **68.5%** (no forgetting).
- Training: **750 steps × 8 gens**, **86.2 min**, **peak VRAM 3.64 GiB**, reward
  **1.23 → 2.80** / 3.25, KL ~0.05, completion length flat ~180 tok.
- Quantize: fp16 3.09 GB / f16 GGUF 2.94 GB / **Q4_K_M 0.93 GB (3.15× smaller)**;
  pass@1 fp16 0.76 == f16 GGUF 0.76 → Q4 **0.69** (~7-pt quant cost, backend-controlled).
- Serve: vLLM fp16 TTFT 19.2 ms / 105.2 tok/s (674 batched); Ollama Q4 TTFT 139 ms /
  **227.8 tok/s**.
- Demo cached examples: base **1/6**, tuned **5/6**.
- Smoke (Phase 0): peak VRAM 1.44 GiB allocated / 1.53 GiB reserved.

**If any check above fails, do not ship / do not present the affected number until
it's reconciled with a committed, seeded script.**
