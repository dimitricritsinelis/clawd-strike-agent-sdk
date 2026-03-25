import {
  DEFAULT_ADAPTIVE_SWEEPER_POLICY,
  normalizeAdaptiveSweeperPolicy
} from "../policies/adaptive-sweeper.mjs";
import { clamp, createSeededRng, choose } from "../utils/random.mjs";

export { createSeededRng };

const SCORE_PHASE = "score-optimization";
const KILL_PHASE = "kill-bootstrap";
const HIT_PHASE = "hit-bootstrap";

const PHASE_LADDERS = Object.freeze({
  [HIT_PHASE]: [
    ["episodesWithHit", 0],
    ["totalShotsHit", 0],
    ["episodesWithKill", 0],
    ["totalKills", 0],
    ["bestScore", 0],
    ["meanSurvivalTimeS", 0.25]
  ],
  [KILL_PHASE]: [
    ["episodesWithKill", 0],
    ["totalKills", 0],
    ["episodesWithHit", 0],
    ["totalShotsHit", 0],
    ["bestScore", 0],
    ["medianScore", 0],
    ["meanSurvivalTimeS", 0.25]
  ],
  [SCORE_PHASE]: [
    ["episodesWithKill", 0],
    ["totalKills", 0],
    ["bestScore", 0],
    ["medianScore", 0],
    ["meanSurvivalTimeS", 0.25]
  ]
});

const PARAMETER_FAMILIES = Object.freeze({
  movement: [
    ["forwardMove", 0.08],
    ["strafeMagnitude", 0.06],
    ["strafePeriodTicks", 6],
    ["fireMoveScale", 0.12],
    ["pauseEveryTicks", 14],
    ["pauseDurationTicks", 2]
  ],
  scan: [
    ["sweepAmplitudeDeg", 0.5],
    ["sweepPeriodTicks", 8],
    ["pitchSweepAmplitudeDeg", 0.4],
    ["pitchSweepPeriodTicks", 10]
  ],
  acquisition: [
    ["openingNoFireTicks", 2],
    ["settleTicks", 2],
    ["fireBurstLengthTicks", 2],
    ["fireBurstCooldownTicks", 3],
    ["engageHoldTicks", 3]
  ],
  reload: [
    ["reloadThreshold", 2],
    ["crouchEveryTicks", 20]
  ],
  recovery: [
    ["panicTurnDeg", 2],
    ["panicTicks", 3],
    ["panicPitchNudgeDeg", 1],
    ["damagePauseTicks", 2],
    ["postScoreHoldTicks", 3]
  ]
});

const TARGET_MODE_MUTATIONS = Object.freeze({
  [HIT_PHASE]: {
    familyNames: ["scan", "acquisition", "movement", "recovery"],
    mutationCount: 2
  },
  [KILL_PHASE]: {
    familyNames: ["acquisition", "movement", "recovery", "scan", "reload"],
    mutationCount: 2
  },
  [SCORE_PHASE]: {
    familyNames: ["movement", "reload", "acquisition", "recovery", "scan"],
    mutationCount: 1
  }
});

function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function firstEpisodeIndexMatching(episodes, predicate) {
  const index = episodes.findIndex(predicate);
  return index >= 0 ? index + 1 : null;
}

function formatPhaseReason(phase, key, direction) {
  return `candidate ${direction} ${key} during ${phase}`;
}

function compareAccuracy(candidate, champion, phase) {
  const candidateAccuracy = Number(candidate?.meanAccuracy ?? 0);
  const championAccuracy = Number(champion?.meanAccuracy ?? 0);
  const candidateShots = Number(candidate?.totalShotsFired ?? 0);
  const championShots = Number(champion?.totalShotsFired ?? 0);
  const comparableFloor = Math.max(5, Math.round(championShots * 0.7));
  const championComparableFloor = Math.max(5, Math.round(candidateShots * 0.7));

  if (candidateAccuracy > championAccuracy + 0.03 && candidateShots >= comparableFloor) {
    return {
      promote: true,
      phase,
      reason: formatPhaseReason(phase, "meanAccuracy", "improved"),
      key: "meanAccuracy",
      delta: candidateAccuracy - championAccuracy
    };
  }

  if (championAccuracy > candidateAccuracy + 0.03 && championShots >= championComparableFloor) {
    return {
      promote: false,
      phase,
      reason: formatPhaseReason(phase, "meanAccuracy", "regressed"),
      key: "meanAccuracy",
      delta: candidateAccuracy - championAccuracy
    };
  }

  return null;
}

function jitterNumber(current, magnitude, rng, min, max, integer = false) {
  const signed = (rng() * 2 - 1) * magnitude;
  const next = clamp(current + signed, min, max);
  return integer ? Math.round(next) : next;
}

export function defaultPolicy() {
  return normalizeAdaptiveSweeperPolicy(DEFAULT_ADAPTIVE_SWEEPER_POLICY);
}

export function createCandidatePolicyRecord(options = {}) {
  const {
    id = 0,
    label = "candidate",
    parentId = null,
    policy = DEFAULT_ADAPTIVE_SWEEPER_POLICY,
    promotedAt = null
  } = options;

  return {
    id,
    label,
    parentId,
    promotedAt,
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

  return {
    totalEpisodes,
    totalKills,
    episodesWithKill,
    episodesWithoutKill: totalEpisodes - episodesWithKill,
    episodesWithHit,
    episodesWithoutHit: totalEpisodes - episodesWithHit,
    firstHitEpisode,
    firstKillEpisode,
    bestScore: scores.length === 0 ? 0 : scores[scores.length - 1],
    medianScore: median(scores),
    meanScore: mean(scores),
    meanSurvivalTimeS: mean(survivals),
    meanAccuracy: mean(accuracies),
    totalShotsFired: shotsFired,
    totalShotsHit: shotsHit,
    acquisitionMet: firstHitEpisode !== null && firstHitEpisode <= 5,
    baselineMet: firstKillEpisode !== null && firstKillEpisode <= 5
  };
}

export function determineTargetMode(aggregate = {}) {
  const totalHits = Number(aggregate?.totalShotsHit ?? 0);
  const totalKills = Number(aggregate?.totalKills ?? 0);

  if (totalHits <= 0 && totalKills <= 0) return HIT_PHASE;
  if (totalKills <= 0) return KILL_PHASE;
  return SCORE_PHASE;
}

export function compareBatchMetrics(candidate, champion, options = {}) {
  const phase = options.targetMode ?? determineTargetMode(champion);
  const minScoreDelta = Number(options.minScoreDelta ?? 0);
  const ladder = PHASE_LADDERS[phase] ?? PHASE_LADDERS[SCORE_PHASE];

  for (const [key, baseMinDelta] of ladder) {
    const minDelta = key === "bestScore" || key === "medianScore"
      ? Math.max(baseMinDelta, minScoreDelta)
      : baseMinDelta;
    const candidateValue = Number(candidate?.[key] ?? 0);
    const championValue = Number(champion?.[key] ?? 0);

    if (candidateValue > championValue + minDelta) {
      return {
        promote: true,
        phase,
        reason: formatPhaseReason(phase, key, "improved"),
        key,
        delta: candidateValue - championValue
      };
    }

    if (championValue > candidateValue + minDelta) {
      return {
        promote: false,
        phase,
        reason: formatPhaseReason(phase, key, "regressed"),
        key,
        delta: candidateValue - championValue
      };
    }
  }

  const accuracyDecision = compareAccuracy(candidate, champion, phase);
  if (accuracyDecision) {
    return accuracyDecision;
  }

  return {
    promote: false,
    phase,
    reason: `candidate did not beat champion during ${phase}`,
    key: "tie",
    delta: 0
  };
}

export const compareAggregates = compareBatchMetrics;

export function mutatePolicy(policy, options = {}) {
  const rng = options.rng ?? Math.random;
  const targetMode = options.targetMode ?? HIT_PHASE;
  const explorationScale = clamp(Number(options.explorationScale ?? 1), 0.25, 3);
  const base = normalizeAdaptiveSweeperPolicy(policy);
  const next = { ...base };

  const strategy = TARGET_MODE_MUTATIONS[targetMode] ?? TARGET_MODE_MUTATIONS[HIT_PHASE];

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
    push("Promoted policy improved hit-positive batch count during hit bootstrap.");
  }

  if (Number(nextAggregate?.totalShotsHit ?? 0) > Number(previousAggregate?.totalShotsHit ?? 0)) {
    push("Promoted policy increased total confirmed hits.");
  }

  if (Number(nextAggregate?.episodesWithKill ?? 0) > Number(previousAggregate?.episodesWithKill ?? 0)) {
    push("Promoted policy improved kill-positive batch count.");
  }

  if (
    Number(nextAggregate?.firstHitEpisode ?? Infinity)
      < Number(previousAggregate?.firstHitEpisode ?? Infinity)
  ) {
    push("Promoted policy reached the first real hit earlier in the batch.");
  }

  if (Number(nextPolicy.pitchSweepAmplitudeDeg) > Number(previousPolicy.pitchSweepAmplitudeDeg)) {
    push("A wider pitch sweep was part of the promoted candidate.");
  }

  if (Number(nextPolicy.settleTicks) > Number(previousPolicy.settleTicks)) {
    push("A longer settle window was part of the promoted candidate.");
  }

  if (Number(nextPolicy.fireBurstCooldownTicks) > Number(previousPolicy.fireBurstCooldownTicks)) {
    push("A slower fire cadence was part of the promoted candidate.");
  }

  if (Number(nextPolicy.fireMoveScale) < Number(previousPolicy.fireMoveScale)) {
    push("Reducing movement while firing was part of the promoted candidate.");
  }

  if (Number(nextPolicy.panicPitchNudgeDeg) > Number(previousPolicy.panicPitchNudgeDeg)) {
    push("A stronger panic pitch nudge was part of the promoted candidate.");
  }

  return notes;
}

export function upsertHallOfFame(hallOfFame, entry, options = {}) {
  const maxEntries = Number(options.maxEntries ?? 5);
  const withoutDuplicate = (Array.isArray(hallOfFame) ? hallOfFame : []).filter(
    (candidate) => candidate.id !== entry.id
  );
  const next = [...withoutDuplicate, entry];

  next.sort((left, right) => {
    const leftVsRight = compareBatchMetrics(left.aggregate ?? {}, right.aggregate ?? {}, {
      minScoreDelta: 0,
      targetMode: determineTargetMode(right.aggregate ?? {})
    });
    if (leftVsRight.promote) return -1;

    const rightVsLeft = compareBatchMetrics(right.aggregate ?? {}, left.aggregate ?? {}, {
      minScoreDelta: 0,
      targetMode: determineTargetMode(left.aggregate ?? {})
    });
    if (rightVsLeft.promote) return 1;

    return String(right.promotedAt ?? "").localeCompare(String(left.promotedAt ?? ""));
  });

  return next.slice(0, maxEntries);
}

export function selectParentFromHallOfFame(hallOfFame, rng) {
  const entries = Array.isArray(hallOfFame) ? hallOfFame : [];
  if (entries.length === 0) return null;

  const weighted = entries.flatMap((entry, index) => (
    Array.from({ length: Math.max(1, entries.length - index) }, () => entry)
  ));

  return choose(rng, weighted);
}

export function suggestNextExperiments(championEntry, stagnationCount = 0) {
  const aggregate = championEntry?.aggregate ?? {};
  const targetMode = determineTargetMode(aggregate);
  const suggestions = [];

  if (targetMode === HIT_PHASE) {
    suggestions.push("Add or widen pitch sweep so the controller explores vertically during scan.");
    suggestions.push("Reduce fire spam with longer settle or cooldown windows before probe bursts.");
    suggestions.push("Consume feedback.recentEvents when present and hold briefly after enemy-hit.");
    suggestions.push("Slow movement while firing so probe bursts happen during lower angular velocity.");
  } else if (targetMode === KILL_PHASE) {
    suggestions.push("Extend engage hold after enemy-hit so confirmed acquisition has time to convert into kills.");
    suggestions.push("Tune settle ticks and fire-move slowdown to keep aim steadier after the first hit.");
    suggestions.push("Revisit reload threshold only after engage windows produce cleaner follow-up damage.");
  } else {
    suggestions.push("Optimize score consistency before widening exploration further.");
    suggestions.push("Tune reload threshold and burst cadence only after movement remains stable.");
  }

  if (stagnationCount >= 3) {
    suggestions.push("Sample a hall-of-fame parent before widening the mutation surface.");
  }

  if (Number(aggregate.meanAccuracy ?? 0) < 0.12) {
    suggestions.push("Shorten fire windows or increase settle time if shot volume stays high without enough hits.");
  }

  return suggestions.slice(0, 4);
}
