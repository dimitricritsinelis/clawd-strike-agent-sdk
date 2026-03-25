# POLICY_SCHEMA.md

The default controller family is `adaptive-sweeper`.

This file defines the safe knobs the agent may tune automatically before touching runtime wrappers or fairness-boundary code.

## Safe automatic mutation surface

| Key | Type | Allowed range | Meaning |
| --- | --- | --- | --- |
| `forwardMove` | number | `0.2 .. 1` | Forward movement strength during scan |
| `strafeMagnitude` | number | `0.05 .. 0.7` | Side movement width |
| `strafePeriodTicks` | integer | `4 .. 60` | How often strafe direction flips |
| `sweepAmplitudeDeg` | number | `0.2 .. 6` | Horizontal look sweep size per tick |
| `sweepPeriodTicks` | integer | `4 .. 80` | How often horizontal sweep direction flips |
| `pitchSweepAmplitudeDeg` | number | `0.1 .. 4` | Maximum vertical scan offset |
| `pitchSweepPeriodTicks` | integer | `6 .. 80` | How quickly pitch scan traverses its range |
| `openingNoFireTicks` | integer | `0 .. 12` | Startup stabilization ticks after spawn |
| `settleTicks` | integer | `0 .. 12` | Lower-turning settle window before firing |
| `fireBurstLengthTicks` | integer | `1 .. 10` | Fire-window length during settle windows |
| `fireBurstCooldownTicks` | integer | `0 .. 24` | Cooldown between settle/fire windows |
| `fireMoveScale` | number | `0.15 .. 1` | Movement slowdown while firing or holding engage |
| `engageHoldTicks` | integer | `0 .. 20` | Hold window after `enemy-hit` or score confirmation |
| `reloadThreshold` | integer | `0 .. 12` | Reload when mag is at or below this count |
| `panicTurnDeg` | number | `1 .. 20` | Extra yaw after taking damage |
| `panicTicks` | integer | `1 .. 24` | How long panic behavior lasts |
| `panicPitchNudgeDeg` | number | `0 .. 6` | Extra pitch adjustment after damage |
| `damagePauseTicks` | integer | `0 .. 12` | Temporary fire pause immediately after damage |
| `crouchEveryTicks` | integer | `0 .. 120` | Crouch cadence. `0` disables it |
| `pauseEveryTicks` | integer | `0 .. 120` | Optional movement-pause cadence. `0` disables it |
| `pauseDurationTicks` | integer | `0 .. 12` | How long each pause lasts |
| `postScoreHoldTicks` | integer | `0 .. 30` | Extra hold window after score or kill confirmation |
| `reverseOnDamage` | boolean | `true` or `false` | Flip strafe direction after taking damage |

## Default policy

```json
{
  "family": "adaptive-sweeper",
  "version": 2,
  "forwardMove": 0.92,
  "strafeMagnitude": 0.24,
  "strafePeriodTicks": 18,
  "sweepAmplitudeDeg": 1.1,
  "sweepPeriodTicks": 20,
  "pitchSweepAmplitudeDeg": 0.7,
  "pitchSweepPeriodTicks": 18,
  "openingNoFireTicks": 4,
  "settleTicks": 3,
  "fireBurstLengthTicks": 2,
  "fireBurstCooldownTicks": 6,
  "fireMoveScale": 0.45,
  "engageHoldTicks": 6,
  "reloadThreshold": 3,
  "panicTurnDeg": 8,
  "panicTicks": 10,
  "panicPitchNudgeDeg": 1.4,
  "damagePauseTicks": 2,
  "crouchEveryTicks": 0,
  "pauseEveryTicks": 0,
  "pauseDurationTicks": 0,
  "postScoreHoldTicks": 5,
  "reverseOnDamage": true
}
```

Older on-disk policies remain valid. Missing fields are filled by normalization.

## Safe automatic changes

Safe by default:

- mutating one or two parameters per candidate
- biasing mutations toward pitch scan, settle, engage, and fire gating during hit bootstrap
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

Use this order:

1. hit bootstrap
   - pitch sweep
   - settle windows
   - fire gating
   - movement slowdown while firing
   - feedback event handling
2. kill bootstrap
   - engage hold
   - panic reaction quality
   - reload timing
3. score optimization
   - consistency
   - survival
   - comparable-volume accuracy

Avoid:

- mutating every parameter at once
- treating a survival-only zero-hit candidate as meaningful progress
- raising attempt budget as the primary response to a completely hitless controller
