import {
  DEFAULT_ADAPTIVE_SWEEPER_POLICY,
  normalizeAdaptiveSweeperPolicy
} from "../policies/adaptive-sweeper.mjs";
import { clamp, createSeededRng, choose } from "../utils/random.mjs";

export { createSeededRng };

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
  const scores = safeEpisodes
    .map((episode) => Number(episode.finalScore ?? episode.lastRun ?? 0))
    .sort((left, right) => left - right);
  const survivals = safeEpisodes.map((episode) => Number(episode.survivalTimeS ?? 0));
  const shotsFired = safeEpisodes.reduce((sum, episode) => sum + Number(episode.shotsFired ?? 0), 0);
  const shotsHit = safeEpisodes.reduce((sum, episode) => sum + Number(episode.shotsHit ?? 0), 0);
  const accuracies = safeEpisodes
    .map((episode) => Number(episode.accuracy ?? 0))
    .filter((value) => Number.isFinite(value));

  const mean = (values) => (
    values.length === 0
      ? 0
      : values.reduce((sum, value) => sum + value, 0) / values.length
  );

  const median = (values) => {
    if (values.length === 0) return 0;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 1
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2;
  };

  return {
    totalEpisodes,
    totalKills,
    episodesWithKill,
    episodesWithoutKill: totalEpisodes - episodesWithKill,
    firstKillEpisode: safeEpisodes.findIndex((episode) => Number(episode.kills ?? 0) > 0) + 1 || null,
    bestScore: scores.length === 0 ? 0 : scores[scores.length - 1],
    medianScore: median(scores),
    meanScore: mean(scores),
    meanSurvivalTimeS: mean(survivals),
    meanAccuracy: mean(accuracies),
    totalShotsFired: shotsFired,
    totalShotsHit: shotsHit,
    baselineMet: totalEpisodes >= 5 && episodesWithKill >= 1
  };
}

export function compareBatchMetrics(candidate, champion, options = {}) {
  const minScoreDelta = Number(options.minScoreDelta ?? 0);

  const ladder = [
    ["episodesWithKill", 0],
    ["totalKills", 0],
    ["bestScore", minScoreDelta],
    ["medianScore", minScoreDelta],
    ["meanSurvivalTimeS", 0.5]
  ];

  for (const [key, minDelta] of ladder) {
    const candidateValue = Number(candidate?.[key] ?? 0);
    const championValue = Number(champion?.[key] ?? 0);

    if (candidateValue > championValue + minDelta) {
      return {
        promote: true,
        reason: `candidate improved ${key}`,
        key,
        delta: candidateValue - championValue
      };
    }

    if (championValue > candidateValue + minDelta) {
      return {
        promote: false,
        reason: `candidate regressed ${key}`,
        key,
        delta: candidateValue - championValue
      };
    }
  }

  const candidateAccuracy = Number(candidate?.meanAccuracy ?? 0);
  const championAccuracy = Number(champion?.meanAccuracy ?? 0);
  const candidateShots = Number(candidate?.totalShotsFired ?? 0);
  const championShots = Number(champion?.totalShotsFired ?? 0);

  if (candidateAccuracy > championAccuracy + 0.03 && candidateShots >= championShots * 0.7) {
    return {
      promote: true,
      reason: "candidate improved meanAccuracy with comparable shot volume",
      key: "meanAccuracy",
      delta: candidateAccuracy - championAccuracy
    };
  }

  return {
    promote: false,
    reason: "candidate did not beat champion on the comparison ladder",
    key: "tie",
    delta: 0
  };
}

export const compareAggregates = compareBatchMetrics;

const PARAMETER_FAMILIES = Object.freeze({
  movement: [
    ["strafeMagnitude", 0.06],
    ["strafePeriodTicks", 6],
    ["pauseEveryTicks", 14],
    ["pauseDurationTicks", 2]
  ],
  sweep: [
    ["sweepAmplitudeDeg", 0.5],
    ["sweepPeriodTicks", 8]
  ],
  combat: [
    ["fireBurstLengthTicks", 2],
    ["fireBurstCooldownTicks", 2],
    ["reloadThreshold", 2],
    ["crouchEveryTicks", 20]
  ],
  panic: [
    ["panicTurnDeg", 2],
    ["panicTicks", 3],
    ["postScoreHoldTicks", 3]
  ]
});

function jitterNumber(current, magnitude, rng, min, max, integer = false) {
  const signed = (rng() * 2 - 1) * magnitude;
  const next = clamp(current + signed, min, max);
  return integer ? Math.round(next) : next;
}

export function mutatePolicy(policy, options = {}) {
  const rng = options.rng ?? Math.random;
  const targetMode = options.targetMode ?? "kill-bootstrap";
  const explorationScale = clamp(Number(options.explorationScale ?? 1), 0.25, 3);
  const base = normalizeAdaptiveSweeperPolicy(policy);
  const next = { ...base };

  const familyNames = targetMode === "kill-bootstrap"
    ? ["movement", "sweep", "combat", "panic"]
    : ["combat", "panic", "sweep", "movement"];

  const chosenFamily = choose(rng, familyNames);
  const family = PARAMETER_FAMILIES[chosenFamily];
  const mutationCount = targetMode === "kill-bootstrap" ? 2 : 1;

  for (let index = 0; index < mutationCount; index += 1) {
    const [key, magnitude] = choose(rng, family);
    const scaledMagnitude = magnitude * explorationScale;

    switch (key) {
      case "strafeMagnitude":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.05, 0.6, false);
        break;
      case "strafePeriodTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 4, 60, true);
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
      case "fireBurstLengthTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 12, true);
        break;
      case "fireBurstCooldownTicks":
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

  if (Number(nextAggregate?.episodesWithKill ?? 0) > Number(previousAggregate?.episodesWithKill ?? 0)) {
    push("Promoted policy improved kill-positive batch count.");
  }

  if (Number(nextAggregate?.bestScore ?? 0) > Number(previousAggregate?.bestScore ?? 0)) {
    push("Promoted policy improved best batch score.");
  }

  if (Number(nextPolicy.sweepPeriodTicks) < Number(previousPolicy.sweepPeriodTicks)) {
    push("A shorter sweep period was part of the promoted candidate.");
  }

  if (Number(nextPolicy.strafeMagnitude) > Number(previousPolicy.strafeMagnitude)) {
    push("A wider strafe was part of the promoted candidate.");
  }

  if (Number(nextPolicy.reloadThreshold) < Number(previousPolicy.reloadThreshold)) {
    push("A later reload threshold was part of the promoted candidate.");
  }

  if (Number(nextPolicy.panicTurnDeg) > Number(previousPolicy.panicTurnDeg)) {
    push("A stronger panic turn was part of the promoted candidate.");
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
    const leftVsRight = compareBatchMetrics(left.aggregate ?? {}, right.aggregate ?? {}, { minScoreDelta: 0 });
    if (leftVsRight.promote) return -1;

    const rightVsLeft = compareBatchMetrics(right.aggregate ?? {}, left.aggregate ?? {}, { minScoreDelta: 0 });
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
  const suggestions = [];

  if (Number(aggregate.episodesWithKill ?? 0) === 0) {
    suggestions.push("Tighten sweep timing and revisit strafe width to bootstrap the first kill.");
    suggestions.push("Increase panic reaction strength after damage if deaths happen quickly.");
  } else {
    suggestions.push("Optimize score consistency before widening exploration further.");
    suggestions.push("Tune reload threshold and burst cadence only after movement remains stable.");
  }

  if (stagnationCount >= 3) {
    suggestions.push("Sample a hall-of-fame parent before widening the mutation surface.");
  }

  if (Number(aggregate.meanAccuracy ?? 0) < 0.15) {
    suggestions.push("Reduce wasted fire by shortening bursts or slowing sweep changes.");
  }

  return suggestions.slice(0, 4);
}
