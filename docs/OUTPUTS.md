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

Candidate summary filenames are session-scoped and collision-safe:

- `learn-20260325t194500123z-ab12cd34-0000.json`
- `learn-20260325t194500123z-ab12cd34-0001.json`
- `learn-20260325t201101456z-ef56gh78-0000.json`

The id allocator scans durable on-disk state and writes summaries with exclusive create semantics, so repeated sessions append evidence instead of silently overwriting older runs.

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
- candidate metadata such as bootstrap archetype or mutation origin
- policy snapshot
- aggregate metrics
- champion aggregate at evaluation start
- `evaluationKind`
- `learningPhase`
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
- `baselineMilestone`
- `learningPhase`
- `phaseHistory`
- `targetMode`
- `acquisitionMet`
- `baselineMet`
- bootstrap catalog rounds and confirmation results
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
- `learningPhase`
- final score
- best score
- survival time
- kills
- headshots
- shots fired
- shots hit
- accuracy
- `hitPositive`
- `killPositive`
- `timeToFirstDamageS`
- `timeToFirstHitS`
- `timeToFirstKillS`
- death cause
- last run score
- `controllerTelemetry`

## Controller telemetry fields

When present, `controllerTelemetry` includes deterministic public-safe acquisition telemetry:

- `learningPhase`
- `feedbackAvailable`
- `recentEventCounts`
- `enemyHitEventsObserved`
- `killEventsObserved`
- `damageEventsObserved`
- `damageReactionCount`
- `modeTicks`
- `modeShots`
- `ticksInEngageMode`
- `ticksInPanicMode`
- `burstCount`
- `avgBurstLength`
- `pitchBandVisits`
- `pitchAbsTravel`
- `yawAbsTravel`
- `scanDirectionFlips`
- `shotsWithinWindowAfterDamage`
- `shotsWithinWindowAfterHit`
- `timeToFirstDamageS`
- `timeToFirstHitS`
- `timeToFirstKillS`
- `estimatedPitchRangeDeg`
- `lastMode`
