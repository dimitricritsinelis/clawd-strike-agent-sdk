# Clawd Strike Agent SDK

Starter kit, examples, and a concrete self-improving loop for browser agents playing Clawd Strike through the public `/skills.md` contract.

This repo is intentionally separate from the game repository.

## What this repo is for

- bootstrapping a contextless agent into Agent mode
- running a public-contract smoke test
- running a deterministic baseline
- running a persistent self-improving controller that keeps local memory across attempts

## What this repo is **not**

- hidden map truth
- enemy coordinates
- routes, landmarks, seeds, or debug state
- a superhuman aimbot

The controller here is deliberately generic. It can bootstrap from nothing, learn from outcomes, and improve, but it still has to search.

## Quick start

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm smoke:no-context
pnpm agent:baseline
pnpm agent:learn
```

## Recommended default run

```bash
HEADLESS=false \
AGENT_NAME=ClawdLearner \
BASELINE_DEATHS=5 \
CANDIDATE_DEATHS=5 \
MAX_CANDIDATES=50 \
STAGNATION_LIMIT=8 \
MIN_SCORE_DELTA=0 \
pnpm agent:learn
```

## Output artifacts

`pnpm agent:learn` writes to `output/self-improving-runner/` by default:

- `champion-policy.json`
  - current best policy and the aggregate metrics that justified promotion
- `episodes.jsonl`
  - append-only episodic memory
- `semantic-memory.json`
  - short durable notes extracted from promotions
- `hall-of-fame.json`
  - top recent promoted policies
- `latest-session-summary.json`
  - the final session summary
- `candidate-summaries/*.json`
  - one file per evaluated candidate

## Why this layout works better than the old starter

The old public starter only had a smoke script and a static baseline loop. That is enough to prove the contract exists, but not enough to produce durable attempt-to-attempt improvement.

This repo adds the missing pieces:

- a persistent browser profile so browser-session `best` survives across evaluations
- a writable external memory surface for episode logs and champion state
- a batch comparison rule so promotion decisions are not based on single noisy runs
- a parameterized controller so learning is a real search problem instead of arbitrary code churn

## Minimum intelligence target

The first gate is:

- at least `1` kill within `5` completed attempts

The learning loop optimizes for that first. After it crosses the gate, it shifts toward better kill consistency and score.

## Tuning knobs

- `BASELINE_DEATHS`
- `CANDIDATE_DEATHS`
- `MAX_CANDIDATES`
- `STAGNATION_LIMIT`
- `MIN_SCORE_DELTA`
- `STEP_MS`
- `MAX_STEPS_PER_EPISODE`
- `USER_DATA_DIR`
- `OUTPUT_DIR`

## Practical limitations

True cross-attempt learning requires both:

- a persistent browser profile directory
- a writable filesystem that survives for the duration of the run, and ideally across reruns

If your agent platform starts with a fresh browser profile and a fresh workspace every time, you do **not** have durable self-learning, even if the agent says it is learning.

## Repository layout

- `skills.md`
  - mirror of the proposed public contract
- `src/`
  - Playwright helpers, policy code, learning code
- `examples/no-context-smoke.mjs`
  - public contract smoke test
- `examples/baseline-loop.mjs`
  - deterministic non-learning baseline
- `examples/self-improving-runner.mjs`
  - champion-challenger learning loop
- `docs/PLAYBOOK.md`
  - operational playbook
- `docs/TUNING_GUIDE.md`
  - parameter and acceptance guidance
- `docs/troubleshooting.md`
  - common failure modes
