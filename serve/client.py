"""Provider-agnostic chat client for the Forge model — with hosted fallback.

Routes to the first healthy provider in priority order:
  1. local vLLM  (fp16, GPU)         — fastest, when the box is on
  2. local Ollama (Q4_K_M GGUF)      — CPU/low-VRAM fallback on the same box
  3. hosted fallback (any OpenAI-compatible URL) — so a demo works when the box
     is OFF (this is the interface Phase 8's demo and Lumina consume)

Every provider speaks the OpenAI /chat/completions contract, so the caller sees
one uniform streaming interface regardless of backend.

Config via env (all optional):
  FORGE_VLLM_URL      default http://127.0.0.1:8000/v1
  FORGE_OLLAMA_URL    default http://127.0.0.1:11434/v1
  FORGE_FALLBACK_URL  hosted OpenAI-compatible base url (no default)
  FORGE_FALLBACK_KEY  api key for the hosted fallback
  FORGE_FALLBACK_MODEL model name at the hosted fallback

Usage:
  from serve.client import ForgeClient
  c = ForgeClient()
  for tok in c.stream("What is 7*8?"):
      print(tok, end="", flush=True)
"""

import json
import os
from dataclasses import dataclass

import requests

SYSTEM_PROMPT = (
    "Respond in the following format:\n<reasoning>\n...\n</reasoning>\n"
    "<answer>\n...\n</answer>\n\nThe <answer> block must contain only the final numeric answer."
)


@dataclass
class Provider:
    name: str
    base_url: str
    model: str
    api_key: str | None = None

    def headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def healthy(self, timeout: float = 1.5) -> bool:
        try:
            r = requests.get(f"{self.base_url}/models", headers=self.headers(), timeout=timeout)
            return r.status_code == 200
        except requests.RequestException:
            return False


def default_providers() -> list[Provider]:
    providers = [
        Provider("vllm-local", os.getenv("FORGE_VLLM_URL", "http://127.0.0.1:8000/v1"), "forge-fp16"),
        Provider("ollama-local", os.getenv("FORGE_OLLAMA_URL", "http://127.0.0.1:11434/v1"), "forge-q4"),
    ]
    if os.getenv("FORGE_FALLBACK_URL"):
        providers.append(
            Provider(
                "hosted-fallback",
                os.environ["FORGE_FALLBACK_URL"],
                os.getenv("FORGE_FALLBACK_MODEL", "forge"),
                os.getenv("FORGE_FALLBACK_KEY"),
            )
        )
    return providers


class ForgeClient:
    def __init__(self, providers: list[Provider] | None = None):
        self.providers = providers or default_providers()

    def active(self) -> Provider | None:
        return next((p for p in self.providers if p.healthy()), None)

    def stream(self, user_prompt: str, max_tokens: int = 512, temperature: float = 0.0):
        provider = self.active()
        if provider is None:
            raise RuntimeError(
                "No Forge provider reachable (local vLLM, local Ollama, or hosted fallback). "
                "Start a server or set FORGE_FALLBACK_URL."
            )
        payload = {
            "model": provider.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        with requests.post(
            f"{provider.base_url}/chat/completions",
            json=payload, headers=provider.headers(), stream=True, timeout=600,
        ) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line or not line.startswith(b"data: "):
                    continue
                data = line[6:]
                if data == b"[DONE]":
                    break
                delta = (json.loads(data).get("choices") or [{}])[0].get("delta", {})
                if delta.get("content"):
                    yield delta["content"]


if __name__ == "__main__":
    import sys

    c = ForgeClient()
    p = c.active()
    print(f"[active provider: {p.name if p else 'NONE'}]\n")
    question = sys.argv[1] if len(sys.argv) > 1 else "What is 7 * 8?"
    for tok in c.stream(question):
        print(tok, end="", flush=True)
    print()
