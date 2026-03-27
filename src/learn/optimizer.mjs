import {
  DEFAULT_ADAPTIVE_SWEEPER_POLICY,
  normalizeAdaptiveSweeperPolicy
} from "../policies/adaptive-sweeper.mjs";
import {
  LEARNING_PHASES,
  aggregateHasHitEvidence,
  aggregateHasKillEvidence,
  aggregateIsZeroContact,
  deriveLearningPhase,
  normalizeLearningPhase,
  summarizeBaselineStatus
} from "./phases.mjs";
import { clamp, createSeededRng, choose } from "../utils/random.mjs";

export { createSeededRng };

const PARAMETER_FAMILIES = Object.freeze({
  movement: [
    ["forwardMove", 0.08],
    ["strafeMagnitude", 0.08],
    ["strafePeriodTicks", 6],
    ["fireMoveScale", 0.1],
    ["damageForwardScale", 0.08],
    ["damageStrafeScale", 0.2],
    ["pauseEveryTicks", 14],
    ["pauseDurationTicks", 2]
  ],
  scan: [
    ["sweepAmplitudeDeg", 0.6],
    ["sweepPeriodTicks", 8],
    ["pitchSweepAmplitudeDeg", 0.5],
    ["pitchSweepPeriodTicks", 8],
    ["microScanYawDeg", 0.4],
    ["microScanPitchDeg", 0.3],
    ["microScanTicks", 2]
  ],
  acquisition: [
    ["openingNoFireTicks", 2],
    ["settleTicks", 2],
    ["fireBurstLengthTicks", 1],
    ["fireBurstCooldownTicks", 3]
  ],
  engage: [
    ["engageHoldTicks", 3],
    ["engageBurstLengthTicks", 2],
    ["engageBurstCooldownTicks", 2],
    ["postScoreHoldTicks", 3]
  ],
  recovery: [
    ["panicTurnDeg", 2],
    ["panicTicks", 2],
    ["panicPitchNudgeDeg", 0.8],
    ["damagePauseTicks", 1],
    ["damageScanMultiplier", 0.25]
  ],
  reload: [
    ["reloadThreshold", 2],
    ["crouchEveryTicks", 20]
  ]
});

const TARGET_PHASE_MUTATIONS = Object.freeze({
  [LEARNING_PHASES.BOOTSTRAP_HIT]: {
    familyNames: ["scan", "acquisition", "movement", "recovery"],
    mutationCount: 3
  },
  [LEARNING_PHASES.BOOTSTRAP_KILL]: {
    familyNames: ["engage", "recovery", "movement", "scan", "reload"],
    mutationCount: 3
  },
  [LEARNING_PHASES.STABILIZE_SCORE]: {
    familyNames: ["engage", "movement", "reload", "scan"],
    mutationCount: 2
  }
});

function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanDefined(values) {
  const defined = values.filter((value) => Number.isFinite(value));
  return defined.length === 0 ? null : mean(defined);
}

function median(values) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function stddev(values) {
  if (values.length <= 1) return 0;
  const sampleMean = mean(values);
  const variance = mean(values.map((value) => (value - sampleMean) ** 2));
  return Math.sqrt(variance);
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function mergeCountMaps(episodes, selector) {
  const merged = {};

  for (const episode of episodes) {
    const source = selector(episode);
    if (!source || typeof source !== "object") continue;

    for (const [key, value] of Object.entries(source)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      merged[key] = Number(merged[key] ?? 0) + numeric;
    }
  }

  return merged;
}

function firstEpisodeIndexMatching(episodes, predicate) {
  const index = episodes.findIndex(predicate);
  return index >= 0 ? index + 1 : null;
}

function minDefined(values) {
  const defined = values.filter((value) => Number.isFinite(value));
  return defined.length === 0 ? null : Math.min(...defined);
}

function formatPhaseReason(phase, key, direction) {
  return `candidate ${direction} ${key} during ${phase}`;
}

function makeDecision({ promote, phase, key, candidateValue, championValue, reason }) {
  const candidateNumber = Number(candidateValue);
  const championNumber = Number(championValue);
  const delta = Number.isFinite(candidateNumber) && Number.isFinite(championNumber)
    ? candidateNumber - championNumber
    : null;

  return {
    promote,
    phase,
    learningPhase: phase,
    reason,
    key,
    candidateValue,
    championValue,
    delta
  };
}

function noPromotion(phase, reason, key = "tie") {
  return makeDecision({
    promote: false,
    phase,
    key,
    candidateValue: null,
    championValue: null,
    reason
  });
}

function compareHigherIsBetter(candidate, champion, phase, key, minDelta = 0) {
  const candidateValue = Number(candidate?.[key] ?? 0);
  const championValue = Number(champion?.[key] ?? 0);

  if (candidateValue > championValue + minDelta) {
    return makeDecision({
      promote: true,
      phase,
      key,
      candidateValue,
      championValue,
      reason: formatPhaseReason(phase, key, "improved")
    });
  }

  if (championValue > candidateValue + minDelta) {
    return makeDecision({
      promote: false,
      phase,
      key,
      candidateValue,
      championValue,
      reason: formatPhaseReason(phase, key, "regressed")
    });
  }

  return null;
}

function compareLowerIsBetter(candidate, champion, phase, key, minDelta = 0.1) {
  const candidateValue = finiteNonNegative(candidate?.[key]);
  const championValue = finiteNonNegative(champion?.[key]);

  if (candidateValue === null || championValue === null) {
    return null;
  }

  if (candidateValue + minDelta < championValue) {
    return makeDecision({
      promote: true,
      phase,
      key,
      candidateValue,
      championValue,
      reason: formatPhaseReason(phase, key, "reached-earlier")
    });
  }

  if (championValue + minDelta < candidateValue) {
    return makeDecision({
      promote: false,
      phase,
      key,
      candidateValue,
      championValue,
      reason: formatPhaseReason(phase, key, "reached-later")
    });
  }

  return null;
}

function compareRate(candidate, champion, phase, key, options = {}) {
  const threshold = Number(options.threshold ?? 0.02);
  const volumeKey = options.volumeKey ?? "totalShotsFired";
  const floor = Math.max(5, Math.round(Number(options.floor ?? 20)));
  const candidateRate = Number(candidate?.[key] ?? 0);
  const championRate = Number(champion?.[key] ?? 0);
  const candidateVolume = Number(candidate?.[volumeKey] ?? 0);
  const championVolume = Number(champion?.[volumeKey] ?? 0);
  const candidateComparableFloor = Math.max(floor, Math.round(championVolume * 0.7));
  const championComparableFloor = Math.max(floor, Math.round(candidateVolume * 0.7));

  if (candidateRate > championRate + threshold && candidateVolume >= candidateComparableFloor) {
    return makeDecision({
      promote: true,
      phase,
      key,
      candidateValue: candidateRate,
      championValue: championRate,
      reason: formatPhaseReason(phase, key, "improved")
    });
  }

  if (championRate > candidateRate + threshold && championVolume >= championComparableFloor) {
    return makeDecision({
      promote: false,
      phase,
      key,
      candidateValue: candidateRate,
      championValue: championRate,
      reason: formatPhaseReason(phase, key, "regressed")
    });
  }

  return null;
}

function compareBootstrapHit(candidate, champion, phase) {
  const candidateHitPositive = aggregateHasHitEvidence(candidate);
  const championHitPositive = aggregateHasHitEvidence(champion);

  if (!candidateHitPositive && !championHitPositive && aggregateIsZeroContact(candidate) && aggregateIsZeroContact(champion)) {
    return noPromotion(
      phase,
      "candidate tied champion in a zero-contact bootstrap_hit batch",
      "zero_contact_tie"
    );
  }

  if (candidateHitPositive && !championHitPositive) {
    return makeDecision({
      promote: true,
      phase,
      key: "episodesWithHit",
      candidateValue: candidate.episodesWithHit,
      championValue: champion.episodesWithHit,
      reason: "candidate introduced hit-positive evidence during bootstrap_hit"
    });
  }

  if (championHitPositive && !candidateHitPositive) {
    return makeDecision({
      promote: false,
      phase,
      key: "episodesWithHit",
      candidateValue: candidate.episodesWithHit,
      championValue: champion.episodesWithHit,
      reason: "candidate lost hit-positive evidence during bootstrap_hit"
    });
  }

  for (const [key, minDelta] of [
    ["episodesWithHit", 0],
    ["totalShotsHit", 0]
  ]) {
    const decision = compareHigherIsBetter(candidate, champion, phase, key, minDelta);
    if (decision) return decision;
  }

  for (const key of ["hitRate", "meanAccuracy"]) {
    const decision = compareRate(candidate, champion, phase, key, { threshold: 0.02 });
    if (decision) return decision;
  }

  for (const key of ["meanTimeToFirstHitS", "bestTimeToFirstHitS"]) {
    const decision = compareLowerIsBetter(candidate, champion, phase, key, 0.2);
    if (decision) return decision;
  }

  for (const [key, minDelta] of [
    ["bestScore", 0],
    ["meanSurvivalTimeS", 0.25]
  ]) {
    const decision = compareHigherIsBetter(candidate, champion, phase, key, minDelta);
    if (decision) return decision;
  }

  return noPromotion(phase, "candidate did not beat champion during bootstrap_hit");
}

function compareBootstrapKill(candidate, champion, phase) {
  const candidateKillPositive = aggregateHasKillEvidence(candidate);
  const championKillPositive = aggregateHasKillEvidence(champion);

  if (candidateKillPositive && !championKillPositive) {
    return makeDecision({
      promote: true,
      phase,
      key: "episodesWithKill",
      candidateValue: candidate.episodesWithKill,
      championValue: champion.episodesWithKill,
      reason: "candidate introduced kill-positive evidence during bootstrap_kill"
    });
  }

  if (championKillPositive && !candidateKillPositive) {
    return makeDecision({
      promote: false,
      phase,
      key: "episodesWithKill",
      candidateValue: candidate.episodesWithKill,
      championValue: champion.episodesWithKill,
      reason: "candidate lost kill-positive evidence during bootstrap_kill"
    });
  }

  if (!candidateKillPositive && !championKillPositive) {
    for (const [key, minDelta] of [
      ["episodesWithHit", 0],
      ["totalShotsHit", 0]
    ]) {
      const decision = compareHigherIsBetter(candidate, champion, phase, key, minDelta);
      if (decision) return decision;
    }

    const hitRateDecision = compareRate(candidate, champion, phase, "hitRate", { threshold: 0.02 });
    if (hitRateDecision) return hitRateDecision;

    for (const key of ["meanTimeToFirstHitS", "bestTimeToFirstHitS"]) {
      const decision = compareLowerIsBetter(candidate, champion, phase, key, 0.2);
      if (decision) return decision;
    }

    const scoreDecision = compareHigherIsBetter(candidate, champion, phase, "bestScore", 0);
    if (scoreDecision) return scoreDecision;

    return noPromotion(
      phase,
      "candidate did not beat champion on contact metrics during bootstrap_kill"
    );
  }

  for (const [key, minDelta] of [
    ["episodesWithKill", 0],
    ["totalKills", 0],
    ["bestScore", 0],
    ["medianScore", 0],
    ["totalShotsHit", 0]
  ]) {
    const decision = compareHigherIsBetter(candidate, champion, phase, key, minDelta);
    if (decision) return decision;
  }

  for (const key of ["hitRate", "meanAccuracy"]) {
    const decision = compareRate(candidate, champion, phase, key, { threshold: 0.02 });
    if (decision) return decision;
  }

  for (const [key, minDelta] of [
    ["meanSurvivalTimeS", 0.25]
  ]) {
    const decision = compareHigherIsBetter(candidate, champion, phase, key, minDelta);
    if (decision) return decision;
  }

  for (const key of ["scoreStdDev", "survivalStdDev"]) {
    const decision = compareLowerIsBetter(candidate, champion, phase, key, 0.1);
    if (decision) return decision;
  }

  return noPromotion(phase, "candidate did not beat champion during bootstrap_kill");
}

function compareStabilizeScore(candidate, champion, phase) {
  for (const [key, minDelta] of [
    ["episodesWithKill", 0],
    ["totalKills", 0],
    ["bestScore", 0],
    ["medianScore", 0],
    ["totalShotsHit", 0]
  ]) {
    const decision = compareHigherIsBetter(candidate, champion, phase, key, minDelta);
    if (decision) return decision;
  }

  for (const key of ["hitRate", "meanAccuracy"]) {
    const decision = compareRate(candidate, champion, phase, key, { threshold: 0.02 });
    if (decision) return decision;
  }

  const survivalDecision = compareHigherIsBetter(candidate, champion, phase, "meanSurvivalTimeS", 0.25);
  if (survivalDecision) return survivalDecision;

  for (const key of ["scoreStdDev", "survivalStdDev"]) {
    const decision = compareLowerIsBetter(candidate, champion, phase, key, 0.1);
    if (decision) return decision;
  }

  return noPromotion(phase, "candidate did not beat champion during stabilize_score");
}

function jitterNumber(current, magnitude, rng, min, max, integer = false) {
  const signed = (rng() * 2 - 1) * magnitude;
  const next = clamp(current + signed, min, max);
  return integer ? Math.round(next) : next;
}

function legacyHallOfFameEntry(entry) {
  if (!entry) return entry;
  const meaningful = aggregateHasHitEvidence(entry.aggregate ?? {}) || aggregateHasKillEvidence(entry.aggregate ?? {});

  return meaningful
    ? { ...entry, legacyZeroContact: false }
    : {
        ...entry,
        legacyZeroContact: true,
        legacyReason: entry.legacyReason ?? "legacy zero-contact bootstrap artifact"
      };
}

export function defaultPolicy() {
  return normalizeAdaptiveSweeperPolicy(DEFAULT_ADAPTIVE_SWEEPER_POLICY);
}

export function createCandidatePolicyRecord(options = {}) {
  const {
    id = "seed",
    label = "candidate",
    parentId = null,
    policy = DEFAULT_ADAPTIVE_SWEEPER_POLICY,
    promotedAt = null,
    learningPhase = LEARNING_PHASES.BOOTSTRAP_HIT,
    metadata = {}
  } = options;

  return {
    id,
    label,
    parentId,
    promotedAt,
    learningPhase: normalizeLearningPhase(learningPhase),
    metadata: { ...metadata },
    policy: normalizeAdaptiveSweeperPolicy(policy),
    aggregate: null,
    episodes: []
  };
}

export function aggregateEpisodes(episodes) {
  const safeEpisodes = Array.isArray(episodes) ? episodes : [];
  const totalEpisodes = safeEpisodes.length;
  const totalKills = safeEpisodes.reduce((sum, episode) => sum + Number(episode.kills ?? 0), 0);
  const episodesWithKill = safeEpisodes.filter((episode) => Number(episode.kills ?? 0) > 0).length;
  const episodesWithHit = safeEpisodes.filter((episode) => Number(episode.shotsHit ?? 0) > 0).length;
  const scores = safeEpisodes
    .map((episode) => Number(episode.finalScore ?? episode.lastRun ?? 0))
    .sort((left, right) => left - right);
  const survivals = safeEpisodes.map((episode) => Number(episode.survivalTimeS ?? 0));
  const shotsFired = safeEpisodes.reduce((sum, episode) => sum + Number(episode.shotsFired ?? 0), 0);
  const shotsHit = safeEpisodes.reduce((sum, episode) => sum + Number(episode.shotsHit ?? 0), 0);
  const accuracies = safeEpisodes
    .map((episode) => Number(episode.accuracy ?? 0))
    .filter((value) => Number.isFinite(value));
  const firstHitEpisode = firstEpisodeIndexMatching(
    safeEpisodes,
    (episode) => Number(episode.shotsHit ?? 0) > 0
  );
  const firstKillEpisode = firstEpisodeIndexMatching(
    safeEpisodes,
    (episode) => Number(episode.kills ?? 0) > 0
  );
  const timeToFirstDamageValues = safeEpisodes.map((episode) => (
    finiteNonNegative(episode.timeToFirstDamageS ?? episode.controllerTelemetry?.timeToFirstDamageS)
  ));
  const timeToFirstHitValues = safeEpisodes.map((episode) => (
    finiteNonNegative(episode.timeToFirstHitS ?? episode.controllerTelemetry?.timeToFirstHitS)
  ));
  const timeToFirstKillValues = safeEpisodes.map((episode) => (
    finiteNonNegative(episode.timeToFirstKillS ?? episode.controllerTelemetry?.timeToFirstKillS)
  ));
  const recentEventCounts = mergeCountMaps(
    safeEpisodes,
    (episode) => episode.controllerTelemetry?.recentEventCounts
  );
  const modeTicks = mergeCountMaps(
    safeEpisodes,
    (episode) => episode.controllerTelemetry?.modeTicks
  );
  const modeShots = mergeCountMaps(
    safeEpisodes,
    (episode) => episode.controllerTelemetry?.modeShots
  );
  const pitchBandVisits = mergeCountMaps(
    safeEpisodes,
    (episode) => episode.controllerTelemetry?.pitchBandVisits
  );
  const damageReactionCount = safeEpisodes.reduce(
    (sum, episode) => sum + Number(episode.controllerTelemetry?.damageReactionCount ?? 0),
    0
  );
  const burstCount = safeEpisodes.reduce(
    (sum, episode) => sum + Number(episode.controllerTelemetry?.burstCount ?? 0),
    0
  );
  const weightedBurstLength = safeEpisodes.reduce((sum, episode) => (
    sum
      + (Number(episode.controllerTelemetry?.avgBurstLength ?? 0)
        * Number(episode.controllerTelemetry?.burstCount ?? 0))
  ), 0);

  const aggregate = {
    totalEpisodes,
    totalKills,
    totalHits: shotsHit,
    episodesWithKill,
    episodesWithoutKill: totalEpisodes - episodesWithKill,
    episodesWithHit,
    episodesWithoutHit: totalEpisodes - episodesWithHit,
    firstHitEpisode,
    firstKillEpisode,
    bestScore: scores.length === 0 ? 0 : scores[scores.length - 1],
    medianScore: median(scores),
    meanScore: mean(scores),
    scoreStdDev: Number(stddev(scores).toFixed(3)),
    meanSurvivalTimeS: mean(survivals),
    survivalStdDev: Number(stddev(survivals).toFixed(3)),
    meanAccuracy: mean(accuracies),
    hitRate: shotsFired > 0 ? Number((shotsHit / shotsFired).toFixed(4)) : 0,
    totalShotsFired: shotsFired,
    totalShotsHit: shotsHit,
    hitPositive: episodesWithHit > 0,
    killPositive: episodesWithKill > 0,
    meanTimeToFirstDamageS: meanDefined(timeToFirstDamageValues),
    bestTimeToFirstDamageS: minDefined(timeToFirstDamageValues),
    meanTimeToFirstHitS: meanDefined(timeToFirstHitValues),
    bestTimeToFirstHitS: minDefined(timeToFirstHitValues),
    meanTimeToFirstKillS: meanDefined(timeToFirstKillValues),
    bestTimeToFirstKillS: minDefined(timeToFirstKillValues),
    recentEventCounts,
    modeTicks,
    modeShots,
    damageReactionCount,
    burstCount,
    avgBurstLength: burstCount > 0 ? Number((weightedBurstLength / burstCount).toFixed(3)) : 0,
    pitchBandVisits,
    pitchAbsTravel: Number(
      safeEpisodes.reduce((sum, episode) => sum + Number(episode.controllerTelemetry?.pitchAbsTravel ?? 0), 0)
        .toFixed(3)
    ),
    yawAbsTravel: Number(
      safeEpisodes.reduce((sum, episode) => sum + Number(episode.controllerTelemetry?.yawAbsTravel ?? 0), 0)
        .toFixed(3)
    ),
    scanDirectionFlips: safeEpisodes.reduce(
      (sum, episode) => sum + Number(episode.controllerTelemetry?.scanDirectionFlips ?? 0),
      0
    ),
    shotsWithinWindowAfterDamage: safeEpisodes.reduce(
      (sum, episode) => sum + Number(episode.controllerTelemetry?.shotsWithinWindowAfterDamage ?? 0),
      0
    ),
    shotsWithinWindowAfterHit: safeEpisodes.reduce(
      (sum, episode) => sum + Number(episode.controllerTelemetry?.shotsWithinWindowAfterHit ?? 0),
      0
    )
  };

  const baseline = summarizeBaselineStatus(aggregate);
  return {
    ...aggregate,
    acquisitionMet: baseline.acquisitionMet,
    baselineMet: baseline.baselineMet,
    learningPhase: baseline.learningPhase
  };
}

export function determineLearningPhase(aggregate = {}) {
  return deriveLearningPhase(aggregate);
}

export function determineTargetMode(aggregate = {}) {
  return deriveLearningPhase(aggregate);
}

export function compareBatchMetrics(candidate, champion, options = {}) {
  const phase = normalizeLearningPhase(
    options.learningPhase ?? options.targetMode ?? deriveLearningPhase(champion)
  );

  if (phase === LEARNING_PHASES.BOOTSTRAP_HIT) {
    return compareBootstrapHit(candidate, champion, phase);
  }

  if (phase === LEARNING_PHASES.BOOTSTRAP_KILL) {
    return compareBootstrapKill(candidate, champion, phase);
  }

  return compareStabilizeScore(candidate, champion, phase);
}

export const compareAggregates = compareBatchMetrics;

export function mutatePolicy(policy, options = {}) {
  const rng = options.rng ?? Math.random;
  const learningPhase = normalizeLearningPhase(
    options.learningPhase ?? options.targetMode ?? LEARNING_PHASES.BOOTSTRAP_HIT
  );
  const explorationScale = clamp(Number(options.explorationScale ?? 1), 0.25, 3);
  const base = normalizeAdaptiveSweeperPolicy(policy);
  const next = { ...base };

  const strategy = TARGET_PHASE_MUTATIONS[learningPhase] ?? TARGET_PHASE_MUTATIONS[LEARNING_PHASES.BOOTSTRAP_HIT];

  for (let index = 0; index < strategy.mutationCount; index += 1) {
    const chosenFamily = choose(rng, strategy.familyNames);
    const family = PARAMETER_FAMILIES[chosenFamily];
    const [key, magnitude] = choose(rng, family);
    const scaledMagnitude = magnitude * explorationScale;

    switch (key) {
      case "forwardMove":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.2, 1, false);
        break;
      case "strafeMagnitude":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.05, 0.7, false);
        break;
      case "strafePeriodTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 4, 60, true);
        break;
      case "fireMoveScale":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.15, 1, false);
        break;
      case "damageForwardScale":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 0.6, false);
        break;
      case "damageStrafeScale":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.8, 2, false);
        break;
      case "pauseEveryTicks":
        next[key] = rng() < 0.25 && next[key] > 0
          ? 0
          : jitterNumber(next[key] || 18, scaledMagnitude, rng, 0, 120, true);
        break;
      case "pauseDurationTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "sweepAmplitudeDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.2, 6, false);
        break;
      case "sweepPeriodTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 4, 80, true);
        break;
      case "pitchSweepAmplitudeDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.1, 4, false);
        break;
      case "pitchSweepPeriodTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 6, 80, true);
        break;
      case "microScanYawDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.2, 4, false);
        break;
      case "microScanPitchDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.1, 3, false);
        break;
      case "microScanTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 12, true);
        break;
      case "openingNoFireTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "settleTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "fireBurstLengthTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 10, true);
        break;
      case "fireBurstCooldownTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 24, true);
        break;
      case "engageHoldTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 20, true);
        break;
      case "engageBurstLengthTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 12, true);
        break;
      case "engageBurstCooldownTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "reloadThreshold":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "crouchEveryTicks":
        next[key] = rng() < 0.3 && next[key] > 0
          ? 0
          : jitterNumber(next[key] || 24, scaledMagnitude, rng, 0, 120, true);
        break;
      case "panicTurnDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 20, false);
        break;
      case "panicTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 24, true);
        break;
      case "panicPitchNudgeDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 6, false);
        break;
      case "damagePauseTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "damageScanMultiplier":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 3, false);
        break;
      case "postScoreHoldTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 30, true);
        break;
      default:
        break;
    }
  }

  if (rng() < 0.15 * explorationScale) {
    next.reverseOnDamage = !next.reverseOnDamage;
  }

  return normalizeAdaptiveSweeperPolicy(next);
}

export function deriveSemanticNotes(previousPolicy, nextPolicy, previousAggregate, nextAggregate) {
  const notes = [];
  if (!previousPolicy || !nextPolicy) return notes;

  const push = (text) => {
    if (text) notes.push(text);
  };

  if (Number(nextAggregate?.episodesWithHit ?? 0) > Number(previousAggregate?.episodesWithHit ?? 0)) {
    push("Promoted policy improved hit-positive batch count during contact bootstrap.");
  }

  if (Number(nextAggregate?.totalShotsHit ?? 0) > Number(previousAggregate?.totalShotsHit ?? 0)) {
    push("Promoted policy increased total confirmed hits.");
  }

  if (Number(nextAggregate?.episodesWithKill ?? 0) > Number(previousAggregate?.episodesWithKill ?? 0)) {
    push("Promoted policy improved kill-positive batch count.");
  }

  if (
    finiteNonNegative(nextAggregate?.bestTimeToFirstHitS) !== null
    && finiteNonNegative(previousAggregate?.bestTimeToFirstHitS) !== null
    && Number(nextAggregate.bestTimeToFirstHitS) < Number(previousAggregate.bestTimeToFirstHitS)
  ) {
    push("Promoted policy reached the first real hit earlier in the batch.");
  }

  if (Number(nextPolicy.pitchSweepAmplitudeDeg) > Number(previousPolicy.pitchSweepAmplitudeDeg)) {
    push("A wider pitch-band sweep was part of the promoted candidate.");
  }

  if (Number(nextPolicy.microScanTicks) > Number(previousPolicy.microScanTicks)) {
    push("Longer damage micro-scans helped reacquire contact.");
  }

  if (Number(nextPolicy.engageBurstLengthTicks) > Number(previousPolicy.engageBurstLengthTicks)) {
    push("Longer engage bursts were part of the promoted candidate.");
  }

  if (Number(nextPolicy.fireBurstCooldownTicks) > Number(previousPolicy.fireBurstCooldownTicks)) {
    push("A slower probe-burst cadence was part of the promoted candidate.");
  }

  if (Number(nextPolicy.fireMoveScale) < Number(previousPolicy.fireMoveScale)) {
    push("Reducing movement while firing was part of the promoted candidate.");
  }

  if (Number(nextPolicy.damageForwardScale) < Number(previousPolicy.damageForwardScale)) {
    push("Reducing forward drift after damage helped reacquisition.");
  }

  return notes;
}

export function upsertHallOfFame(hallOfFame, entry, options = {}) {
  const maxEntries = Number(options.maxEntries ?? 5);
  const candidate = entry ? legacyHallOfFameEntry(entry) : null;
  const withoutDuplicate = (Array.isArray(hallOfFame) ? hallOfFame : [])
    .map((item) => legacyHallOfFameEntry(item))
    .filter((item) => String(item.id) !== String(candidate?.id ?? ""));
  const next = candidate ? [...withoutDuplicate, candidate] : withoutDuplicate;

  next.sort((left, right) => {
    const leftMeaningful = left.legacyZeroContact !== true;
    const rightMeaningful = right.legacyZeroContact !== true;

    if (leftMeaningful !== rightMeaningful) {
      return leftMeaningful ? -1 : 1;
    }

    if (!leftMeaningful && !rightMeaningful) {
      return String(right.promotedAt ?? "").localeCompare(String(left.promotedAt ?? ""));
    }

    const leftVsRight = compareBatchMetrics(left.aggregate ?? {}, right.aggregate ?? {}, {
      learningPhase: deriveLearningPhase(right.aggregate ?? {})
    });
    if (leftVsRight.promote) return -1;

    const rightVsLeft = compareBatchMetrics(right.aggregate ?? {}, left.aggregate ?? {}, {
      learningPhase: deriveLearningPhase(left.aggregate ?? {})
    });
    if (rightVsLeft.promote) return 1;

    return String(right.promotedAt ?? "").localeCompare(String(left.promotedAt ?? ""));
  });

  return next.slice(0, maxEntries);
}

export function selectParentFromHallOfFame(hallOfFame, rng) {
  const entries = (Array.isArray(hallOfFame) ? hallOfFame : [])
    .map((entry) => legacyHallOfFameEntry(entry))
    .filter((entry) => entry.legacyZeroContact !== true);

  if (entries.length === 0) return null;

  const weighted = entries.flatMap((entry, index) => (
    Array.from({ length: Math.max(1, entries.length - index) }, () => entry)
  ));

  return choose(rng, weighted);
}

export function suggestNextExperiments(championEntry, stagnationCount = 0) {
  const aggregate = championEntry?.aggregate ?? {};
  const learningPhase = deriveLearningPhase(aggregate);
  const suggestions = [];

  if (learningPhase === LEARNING_PHASES.BOOTSTRAP_HIT) {
    suggestions.push("Widen the pitch-band ladder or slow its cadence so low/mid/high bands all get visited early.");
    suggestions.push("Use stricter probe bursts instead of longer fire spam during acquisition.");
    suggestions.push("Increase damage micro-scan width or hold length so recent damage causes a local reacquire instead of a long drift.");
    suggestions.push("Bias movement toward strafe over forward motion when recentEvents or damage cues appear.");
  } else if (learningPhase === LEARNING_PHASES.BOOTSTRAP_KILL) {
    suggestions.push("Extend engage hold and engage bursts so first contact has more time to convert into a kill.");
    suggestions.push("Shorten post-damage fire pauses and reload earlier only when conversion windows improve.");
    suggestions.push("Tighten engage pitch recentering so follow-up bursts stay near the last contact band.");
  } else {
    suggestions.push("Optimize kill-positive consistency before widening exploration again.");
    suggestions.push("Use score and median score as the main tie-breakers once kills are already stable.");
    suggestions.push("Treat survival and stability as secondary metrics behind kill throughput.");
  }

  if (stagnationCount >= 3) {
    suggestions.push("Screen the bootstrap catalog again before widening the mutation surface further.");
  }

  if (Number(aggregate.hitRate ?? 0) < 0.12) {
    suggestions.push("Reduce probe-burst length or increase cooldown if shot volume stays high without enough confirmed hits.");
  }

  return suggestions.slice(0, 4);
}
