import { LEARNING_PHASES, normalizeLearningPhase } from "../learn/phases.mjs";
import { normalizeAdaptiveSweeperPolicy } from "./adaptive-sweeper.mjs";

const HIT_ARCHETYPES = Object.freeze([
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
      forwardMove: 0.4,
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
      forwardMove: 0.44,
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
      forwardMove: 0.32,
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
      forwardMove: 0.48,
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
      forwardMove: 0.38,
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
