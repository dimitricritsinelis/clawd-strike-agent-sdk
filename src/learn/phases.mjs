export const LEARNING_PHASES = Object.freeze({
  BOOTSTRAP_HIT: "bootstrap_hit",
  BOOTSTRAP_KILL: "bootstrap_kill",
  STABILIZE_SCORE: "stabilize_score"
});

export const LEARNING_PHASE_ORDER = Object.freeze([
  LEARNING_PHASES.BOOTSTRAP_HIT,
  LEARNING_PHASES.BOOTSTRAP_KILL,
  LEARNING_PHASES.STABILIZE_SCORE
]);

export const PHASE_BASELINES = Object.freeze({
  acquisitionAttempts: 5,
  firstKillAttempts: 5
});

export function normalizeLearningPhase(value) {
  switch (value) {
    case LEARNING_PHASES.BOOTSTRAP_HIT:
    case "hit-bootstrap":
      return LEARNING_PHASES.BOOTSTRAP_HIT;
    case LEARNING_PHASES.BOOTSTRAP_KILL:
    case "kill-bootstrap":
      return LEARNING_PHASES.BOOTSTRAP_KILL;
    case LEARNING_PHASES.STABILIZE_SCORE:
    case "score-optimization":
      return LEARNING_PHASES.STABILIZE_SCORE;
    default:
      return LEARNING_PHASES.BOOTSTRAP_HIT;
  }
}

export function phaseDisplayName(phase) {
  switch (normalizeLearningPhase(phase)) {
    case LEARNING_PHASES.BOOTSTRAP_HIT:
      return "bootstrap hit";
    case LEARNING_PHASES.BOOTSTRAP_KILL:
      return "bootstrap kill";
    case LEARNING_PHASES.STABILIZE_SCORE:
      return "stabilize score";
    default:
      return "bootstrap hit";
  }
}

export function aggregateHasHitEvidence(aggregate = {}) {
  return Number(aggregate?.episodesWithHit ?? 0) > 0 || Number(aggregate?.totalShotsHit ?? 0) > 0;
}

export function aggregateHasKillEvidence(aggregate = {}) {
  return Number(aggregate?.episodesWithKill ?? 0) > 0 || Number(aggregate?.totalKills ?? 0) > 0;
}

export function aggregateIsZeroContact(aggregate = {}) {
  return !aggregateHasHitEvidence(aggregate) && !aggregateHasKillEvidence(aggregate);
}

export function deriveLearningPhase(aggregate = {}) {
  if (aggregateHasKillEvidence(aggregate)) {
    return LEARNING_PHASES.STABILIZE_SCORE;
  }

  if (aggregateHasHitEvidence(aggregate)) {
    return LEARNING_PHASES.BOOTSTRAP_KILL;
  }

  return LEARNING_PHASES.BOOTSTRAP_HIT;
}

export function summarizeBaselineStatus(aggregate = {}) {
  const acquisitionMet = Number(aggregate?.firstHitEpisode ?? Infinity) <= PHASE_BASELINES.acquisitionAttempts;
  const baselineMet = Number(aggregate?.firstKillEpisode ?? Infinity) <= PHASE_BASELINES.firstKillAttempts;

  return {
    acquisitionMet,
    baselineMet,
    learningPhase: deriveLearningPhase(aggregate)
  };
}
