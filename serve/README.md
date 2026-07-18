# Serving Forge

Two backends, one OpenAI-compatible contract, one provider-agnostic client that
falls back automatically — so a demo keeps working when the training box is off.

## Backends

| Backend | Weights | Device | Endpoint | Use |
|---|---|---|---|---|
| **vLLM** | fp16 merged | RTX 5060 GPU | `:8000/v1` | throughput / interactive |
| **Ollama** | Q4_K_M GGUF | CPU (or GPU offload) | `:11434/v1` | reliable, low-VRAM, portable |

### vLLM (GPU)
```bash
make serve-vllm         # OpenAI server on :8000, model name "forge-fp16"
make bench              # TTFT + decode tok/s
```

### Ollama (GGUF)
```bash
curl -fsSL https://ollama.com/install.sh | sh   # one-time (needs sudo)
make serve-ollama       # registers forge-q4 from serve/Modelfile
ollama serve            # OpenAI-compatible on :11434
```

## Measured serving performance (RTX 5060 8GB / Ryzen 7 8700F, single stream)

| Backend | TTFT | decode tok/s | notes |
|---|---|---|---|
| vLLM fp16 (GPU) | **19 ms** | **105 tok/s** | single stream; **674 tok/s** batched aggregate (100 concurrent) |
| Ollama Q4_K_M (GPU) | 139 ms | **228 tok/s** | 29/29 layers offloaded to GPU (Ollama's CUDA v13 supports Blackwell sm_120) |
| Q4_K_M (CPU only) | — | ~21 tok/s | llama.cpp, 16 threads (Phase 5) — the no-GPU fallback |

Why Q4/Ollama out-decodes fp16/vLLM single-stream: single-request decode is
memory-bandwidth-bound, and the Q4 weights are ~4× smaller to stream per token.
vLLM wins on **TTFT** (19 ms vs 139 ms) and on **batched throughput** (674 tok/s),
which is what matters under concurrent load.

## Provider-agnostic client (the interface Phase 8 + Lumina consume)

`serve/client.py` picks the first healthy provider in priority order —
local vLLM → local Ollama → hosted fallback — and streams through a single
uniform interface:

```python
from serve.client import ForgeClient
c = ForgeClient()
for tok in c.stream("What is 7 * 8?"):
    print(tok, end="", flush=True)
```

**Hosted fallback** (demo works when the box is off) — point at any
OpenAI-compatible host via env:
```bash
export FORGE_FALLBACK_URL=https://<host>/v1
export FORGE_FALLBACK_KEY=<key>
export FORGE_FALLBACK_MODEL=<model>
```
With no local server up and a fallback configured, the same client transparently
serves from the cloud.
