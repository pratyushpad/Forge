import type { Metadata } from "next";
import ForgeSecLabel from "../_components/ForgeSecLabel";
import TextIgnite from "../_components/motion/TextIgnite";
import Reveal from "../_components/motion/Reveal";
import RewardStack from "../_components/RewardStack";

export const metadata: Metadata = {
  title: "Method — how Forge was trained",
  description:
    "GRPO explained plainly: group-relative advantages, a programmatic reward stack, the reward cold-start bug that produced zero gradient, and the 8GB-card setup.",
};

// Every component is the value in train/rewards.py; the total is the 3.25 in §3.
const REWARD = [
  {
    name: "Correct answer",
    value: 2.0,
    tone: "ember",
    detail: "Parsed <answer> matches gold. The signal that actually teaches math.",
  },
  {
    name: "Tag presence",
    value: 0.5,
    tone: "glow",
    detail: "Graded: +0.125 per required tag present exactly once. Added to fix the cold start.",
  },
  {
    name: "Exact format",
    value: 0.5,
    tone: "deep",
    detail: "The whole completion matches the strict <reasoning>/<answer> shape.",
  },
  {
    name: "Numeric answer",
    value: 0.25,
    tone: "ash",
    detail: "The <answer> block parses as a number. Soft shaping before correctness is reachable.",
  },
];
const REWARD_MAX = 3.25;

export default function Method() {
  return (
    <div className="wrap">
      <section className="pg-head">
        <ForgeSecLabel num="00" label="Method · how it works" />
        <TextIgnite as="h2" igniteWord="Reinforcement">
          Reinforcement learning against a math checker
        </TextIgnite>
        <p className="pg-lede">
          No supervised fine-tuning, no human preference labels, no learned reward model. The model
          proposes answers, a Python function grades them, and the ones that score above their
          group&apos;s average get reinforced. That is the whole loop.
        </p>
      </section>

      <section>
        <ForgeSecLabel num="01" label="GRPO in plain terms" />
        <Reveal>
          <h3 className="prose-h">Group Relative Policy Optimization</h3>
          <div className="prose">
            <p>
              For each problem the model samples a <b>group of 8 completions</b>. Every completion
              is scored by a reward function, and each one&apos;s <i>advantage</i> is simply how far
              its reward sits from the group&apos;s mean. Completions above the mean get pushed up,
              completions below it get pushed down, and a KL penalty keeps the whole thing tethered
              to the base model so it can&apos;t drift into nonsense that happens to score well.
            </p>
            <p>
              The interesting part is what&apos;s <em>missing</em>. Classic PPO needs a second
              network (a learned critic) to estimate how good a state is, and that critic costs as
              much memory as the policy. GRPO throws it away: <b>the group average is the
              baseline</b>. That single substitution is what lets this run on one consumer card
              instead of a cluster, and it&apos;s the technique behind DeepSeek-R1.
            </p>
            <p>
              It also means the reward has to be <b>verifiable</b>. There&apos;s no human in the
              loop and no model judging taste: just <code>answers_match(parsed, gold)</code>, a
              deterministic check. Grade-school math is a good fit precisely because correctness is
              decidable.
            </p>
          </div>
        </Reveal>
      </section>

      <section>
        <ForgeSecLabel num="02" label="The reward function" />
        <Reveal>
          <h3 className="prose-h">Four terms, {REWARD_MAX} points maximum</h3>
          <p className="prose-lede">
            Correctness dominates by design. Everything else is scaffolding that keeps the gradient
            alive while the model is still learning to answer in a parseable shape.
          </p>
          <RewardStack items={REWARD} max={REWARD_MAX} />
          <p className="caption">
            Source: <code>train/rewards.py</code>. Mean group reward climbed <b>1.23 → 2.80</b> of{" "}
            {REWARD_MAX} over 750 steps.
          </p>
        </Reveal>
      </section>

      <section>
        <ForgeSecLabel num="03" label="The bug that mattered" />
        <Reveal>
          <h3 className="prose-h">Right answers, zero reward, no gradient</h3>
          <div className="prose">
            <p>
              The first smoke run produced <b>0 tagged completions out of 80</b>. Not 0% accuracy:
              the base model was often doing the arithmetic correctly. It just ignored the format
              instruction and answered in prose.
            </p>
          </div>
          <div className="callout">
            <div className="callout-k">Why that is fatal to GRPO specifically</div>
            <p>
              The reward parser looks for an <code>&lt;answer&gt;</code> block. No block means no
              parsed answer, which means reward 0, for <em>every</em> completion in the group. And
              when every member of a group scores identically, every advantage is zero, so the
              gradient is zero. The run wasn&apos;t learning slowly. It was a no-op burning GPU
              hours.
            </p>
          </div>
          <div className="prose">
            <p>The fix had two halves, and it needed both:</p>
            <ol>
              <li>
                <b>A one-shot example in the prompt.</b> A single worked
                <code> What is 2 + 3? </code> turn showing the exact tag structure. Tagged
                completions appear at step 0 instead of never.
              </li>
              <li>
                <b>Grading the tag reward.</b> <code>tag_presence_reward</code> pays +0.125 per
                required tag present exactly once, instead of all-or-nothing. Now a completion with
                3 of 4 tags outscores one with 2, so there is a gradient to climb toward the format
                even before any answer is correct.
              </li>
            </ol>
            <p>
              This is also why the playground sends that same one-shot: the live prompt has to be
              the prompt the model was trained and evaluated under, or the comparison would be
              measuring something else.
            </p>
          </div>
        </Reveal>
      </section>

      <section>
        <ForgeSecLabel num="04" label="The setup" />
        <Reveal>
          <h3 className="prose-h">One 8GB consumer card</h3>
          <dl className="speclist">
            <div>
              <dt>Base model</dt>
              <dd>Qwen2.5-1.5B-Instruct</dd>
            </div>
            <div>
              <dt>Adapter</dt>
              <dd>LoRA, r=16, α=32</dd>
            </div>
            <div>
              <dt>Optimizer</dt>
              <dd>lr 5e-6</dd>
            </div>
            <div>
              <dt>Sequence</dt>
              <dd>1024 tok (256 prompt / 768 completion)</dd>
            </div>
            <div>
              <dt>Run</dt>
              <dd>750 steps × 8 generations</dd>
            </div>
            <div>
              <dt>Wall clock</dt>
              <dd>86.2 min</dd>
            </div>
            <div>
              <dt>Peak VRAM</dt>
              <dd>3.64 GiB of ~6.6 usable</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>3407, greedy decoding for all eval</dd>
            </div>
          </dl>
          <p className="caption">
            Stack: TRL <code>GRPOTrainer</code> + Unsloth <code>FastLanguageModel</code>, with vLLM
            colocated for rollout generation, on an RTX 5060. Peak memory landed at just over half
            the usable budget. The ceiling here was patience, not capacity.
          </p>
        </Reveal>
      </section>

      <section>
        <ForgeSecLabel num="05" label="What this does not claim" />
        <Reveal>
          <div className="prose">
            <p>
              A 1.5B model at 70% on GSM8K is not competitive with frontier models, and it
              isn&apos;t meant to be. The claim is narrower and, I think, more interesting: <b>a
              measurable capability gain from reinforcement learning alone</b>, on hardware anyone
              can buy, with every number reproducible from a seeded script in the repo. The
              forgetting check on ARC-Challenge is there for the same reason: it&apos;s the result
              that would have embarrassed the project if it had gone the other way.
            </p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
