# Forge live endpoint — Modal deploy (run tomorrow)

Goal: put the base + GRPO-tuned model on a **free, scale-to-zero Modal GPU** so the
demo can do live inference. Idle cost = **$0**. You already signed up at modal.com.

Everything here is a couple of copy-paste commands. Run them from the repo root
(`~/forge`) in the `forge` conda env. The app itself is `serve/modal_app.py`.

---

## 0. One-time: install the Modal CLI + authenticate

```bash
pip install modal
modal token new        # opens a browser, links this machine to your Modal account
```

## 1. One-time: set a budget so you can NEVER be charged real money

Modal's free credits depend on the tier:
- **No card on file:** $1/month included credits.
- **Card on file:** **$30/month** included credits (this is the tier we're on).

With a card, there IS a paid path ("when usage reaches $40, you'll be charged $10").
To keep the $30 runway AND guarantee $0 real spend: dashboard → **Settings →
Usage & Billing → Overview → "Set a budget"**, enter **`30`** (= the free credits) or
lower (e.g. `5` for a tighter margin). Apps hard-stop when usage hits the budget —
which is at/below the free credits, before any charge triggers. Scale-to-zero means a
demo only burns credits during the seconds a request runs (cents/month), so even $5 is
plenty. **Do not remove the card to save money — that drops you back to $1/month.**

## 2. Create the API key Secret (the bearer token the proxy sends upstream)

Pick any long random string. This must match `FORGE_FALLBACK_KEY` in Vercel (step 6).

```bash
# generate one if you like: python -c "import secrets; print(secrets.token_urlsafe(32))"
modal secret create forge-api FORGE_API_KEY=<your-long-random-string>
```

## 3. Upload just the 73MB LoRA adapter to a Modal Volume

`outputs/full/` also holds 8 checkpoints — do NOT upload all of it. Copy only the
two adapter files, then push them to `/grpo` in the volume:

```bash
mkdir -p /tmp/forge-adapter
cp outputs/full/adapter_config.json outputs/full/adapter_model.safetensors /tmp/forge-adapter/
modal volume create forge-adapter        # ok if it says already exists
modal volume put forge-adapter /tmp/forge-adapter /grpo
```

## 4. Deploy

```bash
modal deploy serve/modal_app.py
```

Modal prints a public URL for the `serve` web endpoint, e.g.
`https://<you>--forge-vllm-serve.modal.run`. **Copy it.** The OpenAI base URL is
that URL **with `/v1` appended**.

## 5. Verify it actually works (before touching Vercel)

First request cold-starts (~20-40s), then it's fast. Prove base ≠ tuned on a fresh
problem it never saw in training:

```bash
URL=https://<you>--forge-vllm-serve.modal.run/v1
KEY=<your-long-random-string>

for M in base tuned; do
  echo "=== $M ==="
  curl -s $URL/chat/completions \
    -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
    -d "{\"model\":\"$M\",\"messages\":[
      {\"role\":\"system\",\"content\":\"Respond in the following format:\n<reasoning>\n...\n</reasoning>\n<answer>\n...\n</answer>\"},
      {\"role\":\"user\",\"content\":\"Weng earns \$12 an hour for babysitting. Yesterday she did 50 minutes. How much did she earn?\"}],
      \"temperature\":0,\"max_tokens\":512}" | python -m json.tool
done
```

Pass criteria:
- Both return a completion (200, not 401/404/500).
- `tuned` produces a clean `<reasoning>…</reasoning><answer>10</answer>`; base is
  messier / more likely wrong. Different outputs = the adapter is really loading.
- Wait 6+ minutes, curl again → first call is slow again = **scale-to-zero confirmed**.

If `tuned` 404s or errors on the LoRA: the adapter config may point at a 4bit base
name. Fix by editing `/tmp/forge-adapter/adapter_config.json` so
`base_model_name_or_path` = `Qwen/Qwen2.5-1.5B-Instruct`, re-`modal volume put`,
`modal deploy` again.

## 6. Point the demo at it (Vercel env vars)

```bash
cd ~/forge
vercel env add FORGE_FALLBACK_URL production   # paste the URL WITH /v1
vercel env add FORGE_FALLBACK_KEY production    # the same random string as the Secret
vercel env add FORGE_FALLBACK_MODEL production  # value: tuned
```

Then redeploy: `vercel deploy --prebuilt --prod` (or push to `main`).

**Note for the new session:** `demo/app/api/generate/route.ts` currently allowlists
model names `["forge", FORGE_FALLBACK_MODEL]`. For the side-by-side playground it
must allow **both** `"base"` and `"tuned"`. Update the allowlist and have the
playground call `/api/generate` twice (once per model). Details in `forge_handoff.md`.

## Troubleshooting

- **Image build fails on `vllm==0.7.3`** → drop the `==0.7.3` pin in `modal_app.py`,
  redeploy, then re-run step 5 to confirm LoRA still loads on the newer vLLM.
- **`scaledown_window` unknown arg** → your Modal is older; rename it to
  `container_idle_timeout` in `modal_app.py`.
- **OOM on T4** → set `GPU = "L4"` (24GB) in `modal_app.py`, or lower `MAX_MODEL_LEN`.
- **Cold start too slow for the UI** → keep one container warm with
  `min_containers=1` (costs credits continuously — only for a demo/interview window).
