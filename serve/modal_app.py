"""
Forge — Modal serverless GPU endpoint (base + GRPO-tuned, one server).

Serves Qwen2.5-1.5B-Instruct with vLLM's OpenAI-compatible API and mounts the
GRPO LoRA adapter (outputs/full/, ~73MB) as a second "model" via vLLM multi-LoRA.
So a single GPU, single process serves BOTH models the demo compares:

    model="base"   -> Qwen2.5-1.5B-Instruct, no adapter
    model="tuned"  -> same base + GRPO LoRA applied

Why this shape:
  - Scale-to-zero: the container spins down after `scaledown_window` idle seconds,
    so an idle demo costs $0. It cold-starts (~20-40s) on the next request.
  - The tuned model IS a LoRA on the base, so serving it as an adapter mirrors
    exactly how it was trained — no 3GB merged weights to shuffle, just the 73MB
    adapter on a Modal Volume.
  - OpenAI-compatible, so demo/app/api/generate/route.ts talks to it unchanged:
    it POSTs {base}/chat/completions with model="base"|"tuned".

Deploy + verify steps live in serve/MODAL_DEPLOY.md. This file is the app.

Requires (set up once, see the deploy guide):
  - a Modal Volume named "forge-adapter" holding the adapter at /grpo
  - a Modal Secret named "forge-api" holding FORGE_API_KEY (bearer the proxy sends)
"""

import os
import subprocess

import modal

# --- Config knobs ---------------------------------------------------------
BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
GPU = "T4"  # cheapest that fits; bump to "L4" or "A10G" for faster decode
MAX_MODEL_LEN = 2048  # keeps the KV cache small enough for a 16GB T4
VLLM_PORT = 8000
SCALEDOWN_IDLE_S = 60  # spin down after 1 min idle -> $0 when nobody's using it
# (was 300; 60s cuts the billed idle tail after each request ~5x. Trade-off: a
# visitor pausing >1 min between questions triggers another cold start. Good
# balance for a low-traffic portfolio demo on a tight budget.)
STARTUP_TIMEOUT_S = 600  # cold start budget (model load + engine warmup)

# --- Image: vLLM + base weights baked in so cold start is load-from-disk --
def _download_base():
    from huggingface_hub import snapshot_download

    snapshot_download(BASE_MODEL)


vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    # If the image build ever fails on this vllm pin, drop the ==version and
    # let pip resolve the latest; then re-verify LoRA loads (see deploy guide).
    .pip_install("vllm==0.7.3", "huggingface_hub[hf_transfer]==0.26.2")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    .run_function(_download_base)
)

app = modal.App("forge-vllm")

# The 73MB GRPO adapter, uploaded once with `modal volume put` (see deploy guide).
adapter_volume = modal.Volume.from_name("forge-adapter", create_if_missing=True)


@app.function(
    image=vllm_image,
    gpu=GPU,
    volumes={"/adapter": adapter_volume},
    secrets=[modal.Secret.from_name("forge-api")],
    scaledown_window=SCALEDOWN_IDLE_S,  # older Modal: rename to container_idle_timeout
    timeout=STARTUP_TIMEOUT_S,
    min_containers=0,  # scale to zero when idle
)
@modal.web_server(port=VLLM_PORT, startup_timeout=STARTUP_TIMEOUT_S)
def serve():
    """Launch vLLM's OpenAI server with the base model + tuned LoRA adapter."""
    api_key = os.environ["FORGE_API_KEY"]  # from the forge-api Secret
    cmd = [
        "vllm",
        "serve",
        BASE_MODEL,
        "--served-model-name",
        "base",  # so the OpenAI model id is "base", not the HF path
        "--enable-lora",
        "--lora-modules",
        "tuned=/adapter/grpo",  # mounts the GRPO adapter as model id "tuned"
        "--max-lora-rank",
        "16",  # QLoRA was trained at r=16
        "--max-model-len",
        str(MAX_MODEL_LEN),
        "--dtype",
        "half",  # T4 (compute 7.5) has no bfloat16; fp16 is fine for 1.5B inference
        "--enforce-eager",  # skip CUDA-graph compile: faster cold start on a small GPU
        "--api-key",
        api_key,  # requests must send Authorization: Bearer <FORGE_API_KEY>
        "--host",
        "0.0.0.0",
        "--port",
        str(VLLM_PORT),
    ]
    subprocess.Popen(cmd)
