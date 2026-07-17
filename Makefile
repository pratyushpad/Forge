# Forge — GRPO reasoning-RL. Targets grow phase by phase.
# PYTHONPATH is overridden to repo root only: the host shell exports ROS2 py3.12
# paths that would otherwise shadow into the py3.11 forge env.
PY := PYTHONPATH=. $(HOME)/miniconda3/envs/forge/bin/python

.PHONY: test data-stats smoke-train

smoke-train:
	$(PY) -m train.train_grpo --max-steps 20 --output-dir outputs/smoke

test:
	$(PY) -m pytest tests/ -q

data-stats:
	$(PY) -m data.gsm8k
