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
| `fireBurstLengthTicks` | integer | `1 .. 10` | Probe-burst length during acquisition |
| `fireBurstCooldownTicks` | integer | `0 .. 24` | Cooldown between acquisition probe bursts |
| `engageBurstLengthTicks` | integer | `1 .. 12` | Burst length after hit / kill cues |
| `engageBurstCooldownTicks` | integer | `0 .. 12` | Cooldown between engage bursts |
| `fireMoveScale` | number | `0.15 .. 1` | Movement slowdown while firing or holding engage |
| `engageHoldTicks` | integer | `0 .. 20` | Hold window after `enemy-hit` or score confirmation |
| `reloadThreshold` | integer | `0 .. 12` | Reload when mag is at or below this count |
| `panicTurnDeg` | number | `1 .. 20` | Extra yaw after taking damage |
| `panicTicks` | integer | `1 .. 24` | How long panic behavior lasts |
| `panicPitchNudgeDeg` | number | `0 .. 6` | Extra pitch adjustment after damage |
| `damagePauseTicks` | integer | `0 .. 12` | Temporary fire pause immediately after damage |
| `microScanTicks` | integer | `1 .. 12` | Local damage-driven reacquisition hold |
| `microScanYawDeg` | number | `0.2 .. 4` | Horizontal width of the micro-scan |
| `microScanPitchDeg` | number | `0.1 .. 3` | Vertical width of the micro-scan |
| `damageScanMultiplier` | number | `1 .. 3` | Temporary scan widening after damage |
| `damageForwardScale` | number | `0 .. 0.6` | Forward slowdown during damage reacquisition |
| `damageStrafeScale` | number | `0.8 .. 2` | Strafe boost during damage reacquisition |
| `noContactRecoveryTicks` | integer | `0 .. 24` | How long the coarse no-contact recovery state lasts |
| `noContactYawDeg` | number | `1 .. 16` | Coarse yaw committed per tick during no-contact recovery |
| `noContactDamageThreshold` | integer | `1 .. 6` | Damage events without contact before no-contact recovery triggers |
| `noContactReloadThreshold` | integer | `1 .. 6` | Reload cycles without contact before no-contact recovery triggers |
| `noContactMoveZ` | number | `-0.6 .. 0.2` | Forward or reverse move used during no-contact recovery |
| `noContactStrafeScale` | number | `0.8 .. 2.4` | Strafe multiplier used during no-contact recovery |
| `crouchEveryTicks` | integer | `0 .. 120` | Crouch cadence. `0` disables it |
| `pauseEveryTicks` | integer | `0 .. 120` | Optional movement-pause cadence. `0` disables it |
| `pauseDurationTicks` | integer | `0 .. 12` | How long each pause lasts |
| `postScoreHoldTicks` | integer | `0 .. 30` | Extra hold window after score or kill confirmation |
| `reverseOnDamage` | boolean | `true` or `false` | Flip strafe direction after taking damage |

## Default policy

```json
{
  "family": "adaptive-sweeper",
  "version": 3,
  "forwardMove": 0.44,
  "strafeMagnitude": 0.36,
  "strafePeriodTicks": 12,
  "sweepAmplitudeDeg": 2.25,
  "sweepPeriodTicks": 14,
  "pitchSweepAmplitudeDeg": 1.9,
  "pitchSweepPeriodTicks": 12,
  "openingNoFireTicks": 2,
  "settleTicks": 2,
  "fireBurstLengthTicks": 1,
  "fireBurstCooldownTicks": 6,
  "engageBurstLengthTicks": 4,
  "engageBurstCooldownTicks": 1,
  "fireMoveScale": 0.24,
  "engageHoldTicks": 8,
  "reloadThreshold": 4,
  "panicTurnDeg": 9.5,
  "panicTicks": 5,
  "panicPitchNudgeDeg": 1.9,
  "damagePauseTicks": 1,
  "microScanTicks": 5,
  "microScanYawDeg": 1.85,
  "microScanPitchDeg": 1.05,
  "damageScanMultiplier": 2,
  "damageForwardScale": 0.08,
  "damageStrafeScale": 1.85,
  "noContactRecoveryTicks": 6,
  "noContactYawDeg": 5.6,
  "noContactDamageThreshold": 2,
  "noContactReloadThreshold": 2,
  "noContactMoveZ": -0.18,
  "noContactStrafeScale": 1.45,
  "crouchEveryTicks": 0,
  "pauseEveryTicks": 0,
  "pauseDurationTicks": 0,
  "postScoreHoldTicks": 6,
  "reverseOnDamage": true
}
```

Older on-disk policies remain valid. Missing fields are filled by normalization.

## Safe automatic changes

Safe by default:

- mutating one or two parameters per candidate
- biasing mutations toward pitch bands, probe bursts, damage micro-scan, no-contact recovery, and engage hold during contact bootstrap
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
   - pitch-band sweep
   - probe-burst cadence
   - damage micro-scan width
   - no-contact recovery trigger and yaw commit
   - movement slowdown while firing
   - `feedback.recentEvents` handling
2. kill bootstrap
   - engage hold
   - engage burst discipline
   - panic / reacquire timing
   - reload timing
3. score optimization
   - consistency
   - kill rate
   - survival
   - comparable-volume accuracy

Avoid:

- mutating every parameter at once
- treating a survival-only zero-hit candidate as meaningful progress
- raising attempt budget as the primary response to a completely hitless controller
