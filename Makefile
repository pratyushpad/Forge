# Forge — GRPO reasoning-RL. Targets grow phase by phase.
# PYTHONPATH is overridden to repo root only: the host shell exports ROS2 py3.12
# paths that would otherwise shadow into the py3.11 forge env.
PY := PYTHONPATH=. $(HOME)/miniconda3/envs/forge/bin/python

.PHONY: test data-stats smoke-train full-train eval export quantize \
	serve-vllm serve-ollama bench

# Phase 6: serving. vLLM (fp16, GPU) is the throughput path; Ollama (Q4 GGUF) is
# the reliable CPU/low-VRAM path. Both expose an OpenAI-compatible endpoint.
serve-vllm:
	$(PY) -m vllm.entrypoints.openai.api_server --model export/merged_16bit \
		--served-model-name forge-fp16 --dtype float16 --max-model-len 1024 \
		--gpu-memory-utilization 0.7 --port 8000

# Ollama's `FROM ./relative.gguf` does not resolve; rewrite to an absolute path
# at create time so the committed Modelfile stays portable.
serve-ollama:
	sed 's|\./export/gguf/|$(CURDIR)/export/gguf/|' serve/Modelfile > /tmp/forge.Modelfile
	ollama create forge-q4 -f /tmp/forge.Modelfile
	@echo "created forge-q4; run 'ollama serve' for the OpenAI endpoint on :11434"

bench:
	$(PY) -m serve.bench --base-url http://127.0.0.1:8000/v1 --model forge-fp16 --label vllm-fp16

eval:
	$(PY) -m eval.eval_gsm8k
	$(PY) -m eval.eval_arc

# Phase 5: merge LoRA -> fp16 HF, convert to f16 GGUF, quantize to Q4_K_M.
# Requires ~/llama.cpp built (cmake -B build -DGGML_CUDA=OFF; cmake --build build -j).
LLAMACPP := $(HOME)/llama.cpp
export:
	$(PY) -m export.merge_lora
	$(PY) $(LLAMACPP)/convert_hf_to_gguf.py export/merged_16bit \
		--outfile export/gguf/forge-qwen2.5-1.5b-f16.gguf --outtype f16
	$(MAKE) quantize

quantize:
	$(LLAMACPP)/build/bin/llama-quantize \
		export/gguf/forge-qwen2.5-1.5b-f16.gguf \
		export/gguf/forge-qwen2.5-1.5b-q4_k_m.gguf Q4_K_M 16

smoke-train:
	$(PY) -m train.train_grpo --max-steps 20 --output-dir outputs/smoke

# Phase 3: 750 steps x 8 generations/group (grad-accum must equal num-generations
# so each optimizer step covers exactly one full prompt group)
full-train:
	$(PY) -m train.train_grpo --max-steps 750 --num-generations 8 --grad-accum 8 \
		--save-steps 100 --output-dir outputs/full

test:
	$(PY) -m pytest tests/ -q

data-stats:
	$(PY) -m data.gsm8k
