import type { Metadata } from "next";
import RevealBars from "../_components/RevealBars";

export const metadata: Metadata = {
  title: "Results — the evidence",
  description:
    "GSM8K 58.8% → 70.0% on the full 1,319-problem held-out set, an ARC-Challenge forgetting check, training dynamics, and the quantization quality/size/speed trade.",
};

// Every figure below is read off a committed file under eval/results/.
// Nothing on this page is estimated, extrapolated, or rounded up.

export default function Results() {
  return (
    <div className="wrap">
      <section className="pg-head">
        <div className="sec-label">Results · the evidence</div>
        <h2>Every number, and where it came from</h2>
        <p className="pg-lede">
          All evaluation is greedy (temperature=0) at seed 3407, on data the model never trained on.
          Each figure below is read off a JSON file committed under <code>eval/results/</code>. The
          scripts that produced them are in the repo and rerunnable.
        </p>
      </section>

      <section>
        <div className="sec-label">01 · The headline</div>
        <h3 className="prose-h">GSM8K pass@1, full 1,319-problem held-out set</h3>
        <div className="card">
          <h4>Lenient scoring (last number in the output)</h4>
          <RevealBars
            rows={[
              { name: "Base", value: 58.83, label: "58.83%" },
              { name: "GRPO-tuned", value: 69.98, label: "69.98%", tuned: true },
            ]}
          />
          <p className="caption">
            <b>+11.2 points</b> from reinforcement learning alone, no supervised fine-tuning, no
            human labels.
          </p>
        </div>

        <div className="dtable-wrap">
          <table className="dtable">
            <caption>Strict vs lenient parsing, both models</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Strict</th>
                <th scope="col">Lenient</th>
                <th scope="col">Gap</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Base</th>
                <td>54.36%</td>
                <td>58.83%</td>
                <td className="neg">4.47 pts</td>
              </tr>
              <tr className="hi">
                <th scope="row">GRPO-tuned</th>
                <td>69.98%</td>
                <td>69.98%</td>
                <td>0.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="caption">
          The gap column is the quiet result. <b>Strict</b> requires a parseable{" "}
          <code>&lt;answer&gt;</code> block; <b>lenient</b> falls back to grabbing the last number in
          the output. The base model loses 4.47 points to formatting alone: problems it solved but
          couldn&apos;t present. The tuned model scores <b>identically under both</b>, which is a
          direct measurement of 100% format compliance. Quoted honestly, the improvement is{" "}
          <b>+11.2 points lenient</b>, the harder of the two comparisons. Strict-to-strict it is
          +15.6.
        </p>
      </section>

      <section>
        <div className="sec-label">02 · The control</div>
        <h3 className="prose-h">Did math RL damage anything else?</h3>
        <div className="card">
          <h4>ARC-Challenge, 200 questions of general reasoning, never trained on</h4>
          <RevealBars
            rows={[
              { name: "Base", value: 69.5, label: "69.5%" },
              { name: "GRPO-tuned", value: 68.5, label: "68.5%", tuned: true },
            ]}
          />
          <p className="caption">
            <b>−1.0 point</b>, within noise at n=200. Narrow RL on grade-school math did not
            measurably degrade general reasoning. This is the result that would have sunk the
            project had it gone the other way, which is exactly why it&apos;s on the page.
          </p>
        </div>
      </section>

      <section>
        <div className="sec-label">03 · Training dynamics</div>
        <h3 className="prose-h">750 steps, 86.2 minutes, one 8GB card</h3>
        <div className="card span">
          <img
            className="curve"
            src="/reward_curve.png"
            alt="GRPO training curves: mean group reward rising from 1.23 to 2.80 over 750 steps, with completion length and KL divergence plotted below"
          />
          <p className="caption">
            Mean group reward <b>1.23 → 2.80</b> of a possible 3.25.
          </p>
        </div>
        <dl className="speclist">
          <div>
            <dt>Reward</dt>
            <dd>1.23 → 2.80 (max 3.25)</dd>
          </div>
          <div>
            <dt>KL to base</dt>
            <dd>~0.05 (stayed close)</dd>
          </div>
          <div>
            <dt>Completion length</dt>
            <dd>flat ~180 tok (no length hacking)</dd>
          </div>
          <div>
            <dt>Peak VRAM</dt>
            <dd>3.64 GiB of ~6.6 usable</dd>
          </div>
        </dl>
        <p className="caption">
          Flat completion length matters more than it looks. The most common way an RL run cheats a
          reward is by padding: rambling until something scoreable falls out. Length held steady
          while reward more than doubled, so the gain came from better reasoning, not more of it.
        </p>
      </section>

      <section>
        <div className="sec-label">04 · Deployment trade</div>
        <h3 className="prose-h">What quantization costs</h3>
        <div className="dtable-wrap">
          <table className="dtable">
            <caption>GSM8K, first 100 held-out problems, greedy</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Backend</th>
                <th scope="col">pass@1</th>
                <th scope="col">gen tok/s</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">fp16 merged</th>
                <td>vLLM (GPU)</td>
                <td>0.76</td>
                <td>673.9</td>
              </tr>
              <tr>
                <th scope="row">f16 GGUF</th>
                <td>llama.cpp (CPU)</td>
                <td>0.76</td>
                <td>12.6</td>
              </tr>
              <tr>
                <th scope="row">Q4_K_M GGUF</th>
                <td>llama.cpp (CPU)</td>
                <td>0.69</td>
                <td>21.1</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="caption">
          Q4 costs about <b>7 points</b> of accuracy and buys <b>3.15× smaller</b> weights (0.93 GB).
          The f16 GGUF row is the control: it scores identically to fp16/vLLM, which proves the drop
          is <b>quantization</b> and not the CPU backend. At n=100 the 95% confidence interval is
          roughly ±9 points, so treat the magnitude loosely. The direction is what&apos;s solid.
        </p>
      </section>

      <section>
        <div className="sec-label">05 · Serving</div>
        <h3 className="prose-h">Latency vs throughput, single stream</h3>
        <div className="dtable-wrap">
          <table className="dtable">
            <caption>Single-stream serving, 3 prompts</caption>
            <thead>
              <tr>
                <th scope="col">Stack</th>
                <th scope="col">TTFT</th>
                <th scope="col">Decode</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">vLLM fp16 (GPU)</th>
                <td>19.2 ms</td>
                <td>105 tok/s <small>674 batched</small></td>
              </tr>
              <tr>
                <th scope="row">Ollama Q4 (GPU)</th>
                <td>139 ms</td>
                <td>227.8 tok/s</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="caption">
          These measure different things and the winner flips depending on which you need. vLLM
          answers <b>7× faster</b> on first token and scales to 674 tok/s under batching, the right
          call for serving many users. Ollama Q4 decodes a <b>single</b> stream more than twice as
          fast. The live playground runs vLLM, because first-token latency is what a visitor
          actually feels.
        </p>
      </section>

      <section>
        <div className="sec-label">06 · Reproducibility</div>
        <div className="prose">
          <p>
            Seed 3407 throughout, greedy decoding for every evaluation, held-out splits only. The
            raw JSON behind each figure lives in <code>eval/results/</code>, and the scripts that
            wrote it sit next to it in <code>eval/</code>. Where a number here is rounded, the file
            has the full precision.
          </p>
        </div>
      </section>
    </div>
  );
}
