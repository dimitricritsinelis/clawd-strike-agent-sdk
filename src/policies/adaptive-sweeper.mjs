function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeInteger(value, fallback, min, max) {
  const numeric = Number.isFinite(value) ? Math.round(value) : fallback;
  return clamp(numeric, min, max);
}

function sanitizeNumber(value, fallback, min, max) {
  const numeric = Number.isFinite(value) ? Number(value) : fallback;
  return clamp(numeric, min, max);
}

export const DEFAULT_ADAPTIVE_SWEEPER_POLICY = Object.freeze({
  family: "adaptive-sweeper",
  version: 1,
  forwardMove: 1,
  strafeMagnitude: 0.28,
  strafePeriodTicks: 16,
  sweepAmplitudeDeg: 1.35,
  sweepPeriodTicks: 22,
  fireBurstLengthTicks: 2,
  fireBurstCooldownTicks: 4,
  reloadThreshold: 3,
  panicTurnDeg: 6,
  panicTicks: 8,
  crouchEveryTicks: 0,
  pauseEveryTicks: 0,
  pauseDurationTicks: 0,
  postScoreHoldTicks: 5,
  reverseOnDamage: true
});

export function normalizeAdaptiveSweeperPolicy(policy = {}) {
  const source = { ...DEFAULT_ADAPTIVE_SWEEPER_POLICY, ...policy };

  return {
    family: "adaptive-sweeper",
    version: 1,
    forwardMove: sanitizeNumber(source.forwardMove, 1, 0.2, 1),
    strafeMagnitude: sanitizeNumber(source.strafeMagnitude, 0.28, 0.05, 0.6),
    strafePeriodTicks: sanitizeInteger(source.strafePeriodTicks, 16, 4, 60),
    sweepAmplitudeDeg: sanitizeNumber(source.sweepAmplitudeDeg, 1.35, 0.2, 6),
    sweepPeriodTicks: sanitizeInteger(source.sweepPeriodTicks, 22, 4, 80),
    fireBurstLengthTicks: sanitizeInteger(source.fireBurstLengthTicks, 2, 1, 12),
    fireBurstCooldownTicks: sanitizeInteger(source.fireBurstCooldownTicks, 4, 0, 20),
    reloadThreshold: sanitizeInteger(source.reloadThreshold, 3, 0, 12),
    panicTurnDeg: sanitizeNumber(source.panicTurnDeg, 6, 1, 20),
    panicTicks: sanitizeInteger(source.panicTicks, 8, 1, 24),
    crouchEveryTicks: sanitizeInteger(source.crouchEveryTicks, 0, 0, 120),
    pauseEveryTicks: sanitizeInteger(source.pauseEveryTicks, 0, 0, 120),
    pauseDurationTicks: sanitizeInteger(source.pauseDurationTicks, 0, 0, 12),
    postScoreHoldTicks: sanitizeInteger(source.postScoreHoldTicks, 5, 0, 30),
    reverseOnDamage: Boolean(source.reverseOnDamage)
  };
}

export function createAdaptiveSweeperController(policy) {
  const p = normalizeAdaptiveSweeperPolicy(policy);
  const memory = {
    tickIndex: 0,
    lastHealth: null,
    lastScore: 0,
    panicRemaining: 0,
    postScoreHoldRemaining: 0,
    strafeSign: 1,
    burstRemaining: 0,
    burstCooldownRemaining: 0
  };

  function resetEpisode() {
    memory.tickIndex = 0;
    memory.lastHealth = null;
    memory.lastScore = 0;
    memory.panicRemaining = 0;
    memory.postScoreHoldRemaining = 0;
    memory.strafeSign = 1;
    memory.burstRemaining = 0;
    memory.burstCooldownRemaining = 0;
  }

  function nextAction(state) {
    memory.tickIndex += 1;

    const health = typeof state?.health === "number" ? state.health : null;
    const currentScore = Number(state?.score?.current ?? 0);
    const mag = Number(state?.ammo?.mag ?? 0);
    const reserve = Number(state?.ammo?.reserve ?? 0);
    const reloading = state?.ammo?.reloading === true;

    if (health !== null && memory.lastHealth !== null && health < memory.lastHealth) {
      memory.panicRemaining = p.panicTicks;
      if (p.reverseOnDamage) {
        memory.strafeSign *= -1;
      }
    }

    if (currentScore > memory.lastScore) {
      memory.postScoreHoldRemaining = p.postScoreHoldTicks;
    }

    if (memory.tickIndex % p.strafePeriodTicks === 0) {
      memory.strafeSign *= -1;
    }

    const sweepDirection = Math.floor(memory.tickIndex / p.sweepPeriodTicks) % 2 === 0 ? 1 : -1;

    let moveX = p.strafeMagnitude * memory.strafeSign;
    let moveZ = p.forwardMove;
    let lookYawDelta = p.sweepAmplitudeDeg * sweepDirection;

    if (p.pauseEveryTicks > 0 && memory.tickIndex % p.pauseEveryTicks < p.pauseDurationTicks) {
      moveZ = 0.15;
    }

    if (memory.postScoreHoldRemaining > 0) {
      moveZ *= 0.35;
      memory.postScoreHoldRemaining -= 1;
    }

    if (memory.panicRemaining > 0) {
      moveX *= 1.4;
      lookYawDelta += p.panicTurnDeg * -memory.strafeSign;
      memory.panicRemaining -= 1;
    }

    let fire = false;
    if (!reloading) {
      if (memory.burstRemaining > 0) {
        fire = true;
        memory.burstRemaining -= 1;
      } else if (memory.burstCooldownRemaining > 0) {
        memory.burstCooldownRemaining -= 1;
      } else {
        fire = true;
        memory.burstRemaining = Math.max(0, p.fireBurstLengthTicks - 1);
        memory.burstCooldownRemaining = p.fireBurstCooldownTicks;
      }
    }

    const reload = reserve > 0 && !reloading && mag <= p.reloadThreshold;
    const crouch = p.crouchEveryTicks > 0 && (memory.tickIndex % p.crouchEveryTicks) < 2;

    memory.lastHealth = health;
    memory.lastScore = currentScore;

    return {
      moveX: clamp(moveX, -1, 1),
      moveZ: clamp(moveZ, -1, 1),
      lookYawDelta,
      fire,
      reload,
      crouch
    };
  }

  return {
    family: "adaptive-sweeper",
    policy: p,
    resetEpisode,
    nextAction
  };
}
