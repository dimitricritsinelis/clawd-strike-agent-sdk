# POLICY_SCHEMA.md

The default controller family is `adaptive-sweeper`.

This file defines the safe knobs the agent may tune automatically before touching runtime wrappers or fairness-boundary code.

## Safe automatic mutation surface

| Key | Type | Allowed range | Meaning |
| --- | --- | --- | --- |
| `forwardMove` | number | `0.2 .. 1` | Forward movement strength |
| `strafeMagnitude` | number | `0.05 .. 0.6` | Side movement width |
| `strafePeriodTicks` | integer | `4 .. 60` | How often the strafe direction flips |
| `sweepAmplitudeDeg` | number | `0.2 .. 6` | Horizontal look sweep size |
| `sweepPeriodTicks` | integer | `4 .. 80` | How often sweep direction flips |
| `fireBurstLengthTicks` | integer | `1 .. 12` | Number of ticks to keep firing once a burst starts |
| `fireBurstCooldownTicks` | integer | `0 .. 20` | Cooldown ticks between bursts |
| `reloadThreshold` | integer | `0 .. 12` | Reload when mag is at or below this count |
| `panicTurnDeg` | number | `1 .. 20` | Extra yaw after taking damage |
| `panicTicks` | integer | `1 .. 24` | How long panic behavior lasts |
| `crouchEveryTicks` | integer | `0 .. 120` | Crouch cadence. `0` disables it |
| `pauseEveryTicks` | integer | `0 .. 120` | Pause cadence. `0` disables it |
| `pauseDurationTicks` | integer | `0 .. 12` | How long each pause lasts |
| `postScoreHoldTicks` | integer | `0 .. 30` | Slow-down window right after scoring |
| `reverseOnDamage` | boolean | `true` or `false` | Flip strafe direction after taking damage |

## Default policy

```json
{
  "family": "adaptive-sweeper",
  "version": 1,
  "forwardMove": 1,
  "strafeMagnitude": 0.28,
  "strafePeriodTicks": 16,
  "sweepAmplitudeDeg": 1.35,
  "sweepPeriodTicks": 22,
  "fireBurstLengthTicks": 2,
  "fireBurstCooldownTicks": 4,
  "reloadThreshold": 3,
  "panicTurnDeg": 6,
  "panicTicks": 8,
  "crouchEveryTicks": 0,
  "pauseEveryTicks": 0,
  "pauseDurationTicks": 0,
  "postScoreHoldTicks": 5,
  "reverseOnDamage": true
}
```

## Safe automatic changes

Safe by default:

- mutating one or two parameters per candidate
- widening mutation scale slightly during stagnation
- promoting only on batch evidence
- updating `MEMORY.md`, `SELF_LEARNING.md`, and output artifacts

## Human-review changes

Require human review:

- changing the controller family entirely
- widening parameter ranges beyond this schema
- editing selector names
- editing public contract files
- editing runtime wrappers
- adding any hidden or undocumented signal source

## Search guidance

Start with:

- movement and sweep changes to reach the first kill
- reload threshold only after movement looks stable
- panic reaction tuning when damage events correlate with fast deaths

Avoid:

- mutating every parameter at once
- full rewrites after one bad batch
- treating one lucky run as evidence
