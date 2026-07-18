"""Plot the GRPO training curves from a run's log_history.json.

Usage: python -m eval.plot_training [--run outputs/full] [--out docs/reward_curve.png]
"""

import argparse
import json

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

BLUE = "#2563eb"
INK = "#374151"
MUTED = "#9ca3af"


def rolling_mean(xs, w):
    out = []
    for i in range(len(xs)):
        lo = max(0, i - w + 1)
        out.append(sum(xs[lo : i + 1]) / (i + 1 - lo))
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--run", default="outputs/full")
    p.add_argument("--out", default="docs/reward_curve.png")
    p.add_argument("--window", type=int, default=25)
    args = p.parse_args()

    with open(f"{args.run}/log_history.json") as f:
        history = [h for h in json.load(f) if "reward" in h]

    steps = [h["step"] for h in history]
    reward = [h["reward"] for h in history]
    length = [h["completions/mean_length"] for h in history]
    kl = [h.get("kl", 0.0) for h in history]

    fig, (ax1, ax2, ax3) = plt.subplots(
        3, 1, figsize=(8, 8), sharex=True, height_ratios=[2, 1, 1]
    )
    for ax in (ax1, ax2, ax3):
        ax.spines[["top", "right"]].set_visible(False)
        ax.spines[["left", "bottom"]].set_color(MUTED)
        ax.tick_params(colors=INK, labelsize=9)
        ax.grid(axis="y", color=MUTED, alpha=0.25, linewidth=0.5)

    ax1.plot(steps, reward, color=BLUE, alpha=0.22, linewidth=0.8)
    ax1.plot(steps, rolling_mean(reward, args.window), color=BLUE, linewidth=2)
    ax1.axhline(3.25, color=MUTED, linestyle=":", linewidth=1)
    ax1.text(steps[-1], 3.25, " max 3.25", va="center", fontsize=8, color=MUTED)
    ax1.set_ylabel("group reward", color=INK)
    ax1.set_title(
        f"GRPO on GSM8K — Qwen2.5-1.5B-Instruct, {len(steps)} steps "
        f"(raw + {args.window}-step mean)",
        fontsize=11, color=INK, loc="left",
    )

    ax2.plot(steps, rolling_mean(length, args.window), color=BLUE, linewidth=2)
    ax2.set_ylabel("completion len\n(tokens)", color=INK)

    ax3.plot(steps, rolling_mean(kl, args.window), color=BLUE, linewidth=2)
    ax3.set_ylabel("KL", color=INK)
    ax3.set_xlabel("step", color=INK)

    fig.tight_layout()
    fig.savefig(args.out, dpi=150)
    first_w = sum(reward[: args.window]) / args.window
    last_w = sum(reward[-args.window :]) / args.window
    print(f"saved {args.out}")
    print(f"mean reward: first {args.window} steps {first_w:.2f} -> last {args.window} steps {last_w:.2f}")
    print(f"final KL (last-{args.window} mean): {sum(kl[-args.window:]) / args.window:.4f}")
    print(f"completion length (last-{args.window} mean): {sum(length[-args.window:]) / args.window:.0f} tokens")


if __name__ == "__main__":
    main()
