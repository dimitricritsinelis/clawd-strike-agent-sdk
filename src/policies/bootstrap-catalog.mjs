import { LEARNING_PHASES, normalizeLearningPhase } from "../learn/phases.mjs";
import { normalizeAdaptiveSweeperPolicy } from "./adaptive-sweeper.mjs";

const HIT_ARCHETYPES = Object.freeze([
  {
    archetype: "coarse-lane-rotation",
    label: "lane rotation",
    overrides: {
      forwardMove: 0.22,
      strafeMagnitude: 0.42,
      strafePeriodTicks: 9,
      sweepAmplitudeDeg: 4.1,
      sweepPeriodTicks: 22,
      pitchSweepAmplitudeDeg: 1.3,
      pitchSweepPeriodTicks: 16,
      fireBurstLengthTicks: 1,
      fireBurstCooldownTicks: 8,
      noContactRecoveryTicks: 8,
      noContactYawDeg: 7.5,
      noContactMoveZ: -0.24,
      noContactStrafeScale: 1.7
    }
  },
  {
    archetype: "low-forward-high-strafe",
    label: "low forward strafe",
    overrides: {
      forwardMove: 0.18,
      strafeMagnitude: 0.58,
      strafePeriodTicks: 8,
      sweepAmplitudeDeg: 2.6,
      sweepPeriodTicks: 14,
      pitchSweepAmplitudeDeg: 1.7,
      pitchSweepPeriodTicks: 12,
      fireMoveScale: 0.22,
      damageForwardScale: 0.04,
      damageStrafeScale: 1.95,
      noContactMoveZ: -0.12,
      noContactStrafeScale: 1.85
    }
  },
  {
    archetype: "damage-escape-recenter",
    label: "damage escape",
    overrides: {
      forwardMove: 0.34,
      strafeMagnitude: 0.34,
      sweepAmplitudeDeg: 2.1,
      pitchSweepAmplitudeDeg: 1.8,
      microScanTicks: 7,
      microScanYawDeg: 2.3,
      microScanPitchDeg: 1.3,
      panicTurnDeg: 12,
      panicPitchNudgeDeg: 2.4,
      damageForwardScale: 0,
      damageStrafeScale: 2,
      noContactRecoveryTicks: 9,
      noContactYawDeg: 8.4,
      noContactDamageThreshold: 1,
      noContactMoveZ: -0.32,
      noContactStrafeScale: 1.9
    }
  },
  {
    archetype: "wide-horizontal-pitch-ladder",
    label: "wide ladder",
    overrides: {
      forwardMove: 0.56,
      strafeMagnitude: 0.28,
      strafePeriodTicks: 14,
      sweepAmplitudeDeg: 2.2,
      sweepPeriodTicks: 16,
      pitchSweepAmplitudeDeg: 1.8,
      pitchSweepPeriodTicks: 14,
      settleTicks: 2,
      fireBurstLengthTicks: 1,
      fireBurstCooldownTicks: 5,
      microScanTicks: 4,
      microScanYawDeg: 1.4,
      microScanPitchDeg: 0.7
    }
  },
  {
    archetype: "slow-vertical-explore",
    label: "slow vertical",
    overrides: {
      forwardMove: 0.28,
      strafeMagnitude: 0.2,
      sweepAmplitudeDeg: 1.4,
      sweepPeriodTicks: 24,
      pitchSweepAmplitudeDeg: 2.4,
      pitchSweepPeriodTicks: 12,
      settleTicks: 3,
      fireBurstCooldownTicks: 6,
      damageScanMultiplier: 1.9
    }
  },
  {
    archetype: "damage-reactive-hold",
    label: "reactive hold",
    overrides: {
      forwardMove: 0.26,
      strafeMagnitude: 0.3,
      fireMoveScale: 0.28,
      engageHoldTicks: 9,
      engageBurstLengthTicks: 5,
      engageBurstCooldownTicks: 1,
      microScanTicks: 5,
      damageForwardScale: 0.1,
      damageStrafeScale: 1.7
    }
  },
  {
    archetype: "high-strafe-low-forward",
    label: "high strafe",
    overrides: {
      forwardMove: 0.2,
      strafeMagnitude: 0.42,
      strafePeriodTicks: 10,
      sweepAmplitudeDeg: 1.9,
      pitchSweepAmplitudeDeg: 1.4,
      fireBurstCooldownTicks: 4,
      damageStrafeScale: 1.9
    }
  },
  {
    archetype: "disciplined-probe",
    label: "probe burst",
    overrides: {
      forwardMove: 0.24,
      openingNoFireTicks: 2,
      settleTicks: 4,
      fireBurstLengthTicks: 1,
      fireBurstCooldownTicks: 8,
      engageBurstLengthTicks: 4,
      fireMoveScale: 0.25
    }
  },
  {
    archetype: "tight-micro-scan",
    label: "tight micro-scan",
    overrides: {
      forwardMove: 0.22,
      strafeMagnitude: 0.35,
      sweepAmplitudeDeg: 1.6,
      pitchSweepAmplitudeDeg: 1.2,
      microScanTicks: 6,
      microScanYawDeg: 1.1,
      microScanPitchDeg: 0.9,
      damagePauseTicks: 0,
      panicTicks: 5
    }
  }
]);

const KILL_ARCHETYPES = Object.freeze([
  {
    archetype: "conversion-hold",
    label: "conversion hold",
    overrides: {
      fireMoveScale: 0.24,
      engageHoldTicks: 10,
      engageBurstLengthTicks: 5,
      engageBurstCooldownTicks: 1,
      postScoreHoldTicks: 7
    }
  },
  {
    archetype: "quick-reacquire",
    label: "quick reacquire",
    overrides: {
      microScanTicks: 5,
      microScanYawDeg: 1.3,
      microScanPitchDeg: 0.8,
      damagePauseTicks: 0,
      damageScanMultiplier: 2,
      panicTicks: 4
    }
  },
  {
    archetype: "steady-firing",
    label: "steady firing",
    overrides: {
      forwardMove: 0.42,
      strafeMagnitude: 0.18,
      fireMoveScale: 0.2,
      engageBurstLengthTicks: 6,
      engageBurstCooldownTicks: 0,
      reloadThreshold: 5
    }
  },
  {
    archetype: "wide-recenter",
    label: "wide recenter",
    overrides: {
      sweepAmplitudeDeg: 1.7,
      pitchSweepAmplitudeDeg: 1.5,
      engageHoldTicks: 8,
      microScanTicks: 4,
      damageForwardScale: 0.12
    }
  },
  {
    archetype: "disciplined-finish",
    label: "disciplined finish",
    overrides: {
      settleTicks: 3,
      fireBurstLengthTicks: 1,
      fireBurstCooldownTicks: 6,
      engageBurstLengthTicks: 4,
      engageBurstCooldownTicks: 1,
      fireMoveScale: 0.22
    }
  }
]);

function applyArchetype(basePolicy, entry, learningPhase) {
  return {
    ...entry,
    learningPhase,
    policy: normalizeAdaptiveSweeperPolicy({
      ...basePolicy,
      ...entry.overrides
    })
  };
}

export function createBootstrapCatalog(basePolicy, options = {}) {
  const learningPhase = normalizeLearningPhase(options.learningPhase);
  const limit = Math.max(1, Math.round(Number(options.limit ?? 6)));
  const source = learningPhase === LEARNING_PHASES.BOOTSTRAP_KILL
    ? KILL_ARCHETYPES
    : HIT_ARCHETYPES;

  return source
    .slice(0, limit)
    .map((entry) => applyArchetype(basePolicy, entry, learningPhase));
}
