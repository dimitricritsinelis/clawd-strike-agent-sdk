# OUTPUTS.md

This file defines the artifact contract for smoke, baseline, and learning runs.

## Minimum durable learning artifacts

`pnpm agent:learn` must write at least:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`

If those files are missing, the run should not be described as durable self-improvement.

## Recommended supporting artifacts

The starter also writes:

- `output/self-improving-runner/semantic-memory.json`
- `output/self-improving-runner/hall-of-fame.json`
- `output/self-improving-runner/scoreboard.json`
- `output/self-improving-runner/resolved-run-config.json`

The starter may also update:

- `MEMORY.md`
- `SELF_LEARNING.md`

## Smoke outputs

`pnpm smoke:no-context` writes a timestamped folder under `output/no-context-smoke/` with:

- `summary.json`
- `console.json`
- screenshots for runtime start, death, and respawn when available

## Baseline outputs

`pnpm agent:baseline` writes under `output/baseline/`:

- `latest-session-summary.json`
- `latest-episode.json`
- `resolved-run-config.json`

## Candidate summary shape

Each candidate summary should include:

- candidate id and parent id
- policy snapshot
- aggregate metrics
- champion aggregate at evaluation start
- promote / reject decision
- reason for the decision
- generation timestamp

## Champion policy shape

`champion-policy.json` should include:

- policy id
- label
- parent id when present
- promoted timestamp
- policy payload
- aggregate metrics for the batch that justified promotion

## Session summary shape

`latest-session-summary.json` should include:

- start time
- finish time
- stop reason
- resolved run config metadata
- baseline status
- promotions
- rejections
- final champion
- key lessons learned
- next recommended experiments

## Episodes log shape

Each line in `episodes.jsonl` should represent one completed death-to-death attempt and include:

- candidate id
- candidate label
- recorded time
- episode index
- final score
- best score
- survival time
- kills
- headshots
- shots fired
- shots hit
- accuracy
- death cause
- lastRun
