# OUTPUTS.md

This file defines the artifact contract for smoke, baseline, and learning runs.

## Required learning artifacts

`pnpm agent:learn` must write:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`

If those paths are missing, the run is not durable self-improvement.

## Supporting artifacts

The learner also tries to write:

- `output/self-improving-runner/semantic-memory.json`
- `output/self-improving-runner/hall-of-fame.json`
- `output/self-improving-runner/scoreboard.json`
- `output/self-improving-runner/resolved-run-config.json`
- `MEMORY.md`
- `SELF_LEARNING.md`

Supporting-artifact failures should be surfaced as warnings in `latest-session-summary.json` and stderr/console output. Required-artifact failures should fail the command.

## Candidate summary ids

Candidate summary filenames are padded and monotonic:

- `0000.json`
- `0001.json`
- `0002.json`

The next id is derived from durable on-disk state:

- existing `candidate-summaries/*.json`
- `champion-policy.json`
- `hall-of-fame.json`

Older summaries are never overwritten because of id reuse.

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

Each candidate summary includes:

- candidate id, label, and parent id
- policy snapshot
- aggregate metrics
- champion aggregate at evaluation start
- `evaluationKind`
- `targetMode`
- `acquisitionMet`
- `baselineMet`
- promote / reject decision
- generation timestamp

Seed or champion backfill summaries may use a non-comparison `evaluationKind`, but they still reserve the durable candidate id and record the policy state honestly.

## Champion policy shape

`champion-policy.json` includes:

- policy id
- label
- parent id when present
- promoted timestamp
- policy payload
- aggregate metrics for the batch that justified promotion

## Session summary shape

`latest-session-summary.json` includes:

- start time
- finish time
- stop reason
- resolved run config metadata
- `acquisitionTarget`
- `firstKillTarget`
- `targetMode`
- `acquisitionMet`
- `baselineMet`
- promotions
- rejections
- final champion
- warnings for supportive-output failures
- key lessons learned
- next recommended experiments

## Episodes log shape

Each line in `episodes.jsonl` represents one completed death-to-death attempt and includes:

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
- last run score
- `controllerTelemetry`

## Controller telemetry fields

When present, `controllerTelemetry` includes a small deterministic payload:

- `feedbackAvailable`
- `enemyHitEventsObserved`
- `killEventsObserved`
- `damageEventsObserved`
- `ticksInEngageMode`
- `ticksInPanicMode`
- `estimatedPitchRangeDeg`
- `lastMode`
