# Tuning guide

Optional background doc. This is not part of the required reading order.

## First principles

Clawd Strike under the public contract is a sparse-reward control problem.

That means:

- change a little
- compare on batches
- keep evidence
- do not promote survival-only zero-hit behavior

## High-value parameters before the first hit

Focus on:

- `pitchSweepAmplitudeDeg`
- `pitchSweepPeriodTicks`
- `settleTicks`
- `fireBurstLengthTicks`
- `fireBurstCooldownTicks`
- `fireMoveScale`
- `openingNoFireTicks`

These control vertical acquisition, settle windows, and spam reduction.

## High-value parameters after the first hit

Focus on:

- `engageHoldTicks`
- `panicTurnDeg`
- `panicPitchNudgeDeg`
- `damagePauseTicks`
- `reloadThreshold`

These control conversion, damage recovery, and follow-up stability.

## Batch sizes

For bootstrap:

- `BASELINE_DEATHS=5`
- `CANDIDATE_DEATHS=5`

For longer score optimization:

- `BASELINE_DEATHS=7`
- `CANDIDATE_DEATHS=7`

## Stagnation handling

If no promotion occurs for many candidates:

- sample a hall-of-fame parent
- widen mutation magnitude modestly
- if the batch is still zero-hit, escalate to `src/policies/**`

Do not make attempt budget the primary remedy for a completely hitless controller.
