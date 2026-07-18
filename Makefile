# Forge — GRPO reasoning-RL. Targets grow phase by phase.
# PYTHONPATH is overridden to repo root only: the host shell exports ROS2 py3.12
# paths that would otherwise shadow into the py3.11 forge env.
PY := PYTHONPATH=. $(HOME)/miniconda3/envs/forge/bin/python

.PHONY: test data-stats smoke-train full-train eval export quantize

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
