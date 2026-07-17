# Forge — GRPO reasoning-RL. Targets grow phase by phase.
# PYTHONPATH is overridden to repo root only: the host shell exports ROS2 py3.12
# paths that would otherwise shadow into the py3.11 forge env.
PY := PYTHONPATH=. $(HOME)/miniconda3/envs/forge/bin/python

.PHONY: test data-stats smoke-train full-train

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
