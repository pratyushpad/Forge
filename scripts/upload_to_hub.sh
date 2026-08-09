#!/usr/bin/env bash
# Upload the Forge training artifacts to the Hugging Face Hub:
#   outputs/full/            GRPO LoRA adapter (r=16 — the same ~73MB adapter the live demo serves)
#   export/gguf/*.gguf       merged-model GGUFs (f16 + Q4_K_M)
#   MODEL_CARD.md            uploaded as the Hub repo's README.md
#
# Prereqs (one-time):
#   pip install -U huggingface_hub
#   hf auth login
#
# Run from the repo root ON THE MACHINE THAT HOLDS THE ARTIFACTS (they are
# gitignored, so a fresh clone won't have them — train first or rsync them in):
#   ./scripts/upload_to_hub.sh                      # repo id = <your-hf-user>/forge-qwen2.5-1.5b-grpo-gsm8k
#   HF_REPO=me/my-name ./scripts/upload_to_hub.sh   # or set the repo id explicitly
set -euo pipefail

cd "$(dirname "$0")/.."

ADAPTER_DIR="outputs/full"
GGUF_F16="export/gguf/forge-qwen2.5-1.5b-f16.gguf"
GGUF_Q4="export/gguf/forge-qwen2.5-1.5b-q4_k_m.gguf"

command -v hf >/dev/null 2>&1 || {
  echo "error: 'hf' CLI not found — pip install -U huggingface_hub" >&2
  exit 1
}
hf auth whoami >/dev/null 2>&1 || {
  echo "error: not logged in to the Hub — run 'hf auth login' first" >&2
  exit 1
}

if [[ -z "${HF_REPO:-}" ]]; then
  HF_USER="$(python3 -c 'from huggingface_hub import whoami; print(whoami()["name"])')"
  HF_REPO="${HF_USER}/forge-qwen2.5-1.5b-grpo-gsm8k"
fi
echo "uploading to: ${HF_REPO}"

[[ -d "$ADAPTER_DIR" ]] || {
  echo "error: ${ADAPTER_DIR}/ not found — run this on the training box (or rsync outputs/full/ here)" >&2
  exit 1
}

# Idempotent: create if missing, no-op if it exists.
hf repo create "$HF_REPO" --repo-type model >/dev/null 2>&1 || true

hf upload "$HF_REPO" MODEL_CARD.md README.md \
  --repo-type model --commit-message "model card"

hf upload "$HF_REPO" "$ADAPTER_DIR" adapter \
  --repo-type model --commit-message "GRPO LoRA adapter (outputs/full)"

for gguf in "$GGUF_F16" "$GGUF_Q4"; do
  if [[ -f "$gguf" ]]; then
    hf upload "$HF_REPO" "$gguf" "gguf/$(basename "$gguf")" \
      --repo-type model --commit-message "GGUF: $(basename "$gguf")"
  else
    echo "warn: ${gguf} not found — skipping (run 'make export' to build the GGUFs)" >&2
  fi
done

echo "done: https://huggingface.co/${HF_REPO}"
