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

function createEmptyTelemetry() {
  return {
    feedbackAvailable: false,
    enemyHitEventsObserved: 0,
    killEventsObserved: 0,
    damageEventsObserved: 0,
    ticksInEngageMode: 0,
    ticksInPanicMode: 0,
    estimatedPitchRangeDeg: 0,
    lastMode: "opening"
  };
}

function copyTelemetry(telemetry) {
  return {
    feedbackAvailable: Boolean(telemetry.feedbackAvailable),
    enemyHitEventsObserved: Number(telemetry.enemyHitEventsObserved ?? 0),
    killEventsObserved: Number(telemetry.killEventsObserved ?? 0),
    damageEventsObserved: Number(telemetry.damageEventsObserved ?? 0),
    ticksInEngageMode: Number(telemetry.ticksInEngageMode ?? 0),
    ticksInPanicMode: Number(telemetry.ticksInPanicMode ?? 0),
    estimatedPitchRangeDeg: Number(telemetry.estimatedPitchRangeDeg ?? 0),
    lastMode: telemetry.lastMode ?? "opening"
  };
}

export const DEFAULT_ADAPTIVE_SWEEPER_POLICY = Object.freeze({
  family: "adaptive-sweeper",
  version: 2,
  forwardMove: 0.92,
  strafeMagnitude: 0.24,
  strafePeriodTicks: 18,
  sweepAmplitudeDeg: 1.1,
  sweepPeriodTicks: 20,
  pitchSweepAmplitudeDeg: 0.7,
  pitchSweepPeriodTicks: 18,
  openingNoFireTicks: 4,
  settleTicks: 3,
  fireBurstLengthTicks: 2,
  fireBurstCooldownTicks: 6,
  fireMoveScale: 0.45,
  engageHoldTicks: 6,
  reloadThreshold: 3,
  panicTurnDeg: 8,
  panicTicks: 10,
  panicPitchNudgeDeg: 1.4,
  damagePauseTicks: 2,
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
    version: 2,
    forwardMove: sanitizeNumber(source.forwardMove, 0.92, 0.2, 1),
    strafeMagnitude: sanitizeNumber(source.strafeMagnitude, 0.24, 0.05, 0.7),
    strafePeriodTicks: sanitizeInteger(source.strafePeriodTicks, 18, 4, 60),
    sweepAmplitudeDeg: sanitizeNumber(source.sweepAmplitudeDeg, 1.1, 0.2, 6),
    sweepPeriodTicks: sanitizeInteger(source.sweepPeriodTicks, 20, 4, 80),
    pitchSweepAmplitudeDeg: sanitizeNumber(source.pitchSweepAmplitudeDeg, 0.7, 0.1, 4),
    pitchSweepPeriodTicks: sanitizeInteger(source.pitchSweepPeriodTicks, 18, 6, 80),
    openingNoFireTicks: sanitizeInteger(source.openingNoFireTicks, 4, 0, 12),
    settleTicks: sanitizeInteger(source.settleTicks, 3, 0, 12),
    fireBurstLengthTicks: sanitizeInteger(source.fireBurstLengthTicks, 2, 1, 10),
    fireBurstCooldownTicks: sanitizeInteger(source.fireBurstCooldownTicks, 6, 0, 24),
    fireMoveScale: sanitizeNumber(source.fireMoveScale, 0.45, 0.15, 1),
    engageHoldTicks: sanitizeInteger(source.engageHoldTicks, 6, 0, 20),
    reloadThreshold: sanitizeInteger(source.reloadThreshold, 3, 0, 12),
    panicTurnDeg: sanitizeNumber(source.panicTurnDeg, 8, 1, 20),
    panicTicks: sanitizeInteger(source.panicTicks, 10, 1, 24),
    panicPitchNudgeDeg: sanitizeNumber(source.panicPitchNudgeDeg, 1.4, 0, 6),
    damagePauseTicks: sanitizeInteger(source.damagePauseTicks, 2, 0, 12),
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
    engageRemaining: 0,
    postScoreHoldRemaining: 0,
    damagePauseRemaining: 0,
    strafeSign: 1,
    sweepDirection: 1,
    pitchDirection: 1,
    pitchOffsetDeg: 0,
    minPitchOffsetDeg: 0,
    maxPitchOffsetDeg: 0,
    fireCycleTick: 0,
    seenEventIds: new Set(),
    seenEventOrder: [],
    telemetry: createEmptyTelemetry()
  };

  function resetEpisode() {
    memory.tickIndex = 0;
    memory.lastHealth = null;
    memory.lastScore = 0;
    memory.panicRemaining = 0;
    memory.engageRemaining = 0;
    memory.postScoreHoldRemaining = 0;
    memory.damagePauseRemaining = 0;
    memory.strafeSign = 1;
    memory.sweepDirection = 1;
    memory.pitchDirection = 1;
    memory.pitchOffsetDeg = 0;
    memory.minPitchOffsetDeg = 0;
    memory.maxPitchOffsetDeg = 0;
    memory.fireCycleTick = 0;
    memory.seenEventIds.clear();
    memory.seenEventOrder = [];
    memory.telemetry = createEmptyTelemetry();
  }

  function rememberEventId(rawId) {
    if (rawId === undefined || rawId === null) return true;
    const key = String(rawId);
    if (memory.seenEventIds.has(key)) {
      return false;
    }

    memory.seenEventIds.add(key);
    memory.seenEventOrder.push(key);
    if (memory.seenEventOrder.length > 256) {
      const oldest = memory.seenEventOrder.shift();
      if (oldest) memory.seenEventIds.delete(oldest);
    }

    return true;
  }

  function notePitch(delta) {
    memory.pitchOffsetDeg = clamp(
      memory.pitchOffsetDeg + delta,
      -p.pitchSweepAmplitudeDeg * 1.5,
      p.pitchSweepAmplitudeDeg * 1.5
    );
    memory.minPitchOffsetDeg = Math.min(memory.minPitchOffsetDeg, memory.pitchOffsetDeg);
    memory.maxPitchOffsetDeg = Math.max(memory.maxPitchOffsetDeg, memory.pitchOffsetDeg);
    memory.telemetry.estimatedPitchRangeDeg = Number(
      (memory.maxPitchOffsetDeg - memory.minPitchOffsetDeg).toFixed(3)
    );
  }

  function applyDamageReaction() {
    memory.panicRemaining = Math.max(memory.panicRemaining, p.panicTicks);
    memory.damagePauseRemaining = Math.max(memory.damagePauseRemaining, p.damagePauseTicks);

    if (p.reverseOnDamage) {
      memory.strafeSign *= -1;
    }

    const panicPitchSign = memory.strafeSign >= 0 ? 1 : -1;
    memory.pitchOffsetDeg = clamp(
      memory.pitchOffsetDeg + (panicPitchSign * p.panicPitchNudgeDeg),
      -p.pitchSweepAmplitudeDeg * 1.5,
      p.pitchSweepAmplitudeDeg * 1.5
    );
    memory.pitchDirection = memory.pitchOffsetDeg >= 0 ? -1 : 1;
  }

  function getNewFeedbackEvents(state) {
    const recentEvents = Array.isArray(state?.feedback?.recentEvents) ? state.feedback.recentEvents : [];
    if (recentEvents.length > 0) {
      memory.telemetry.feedbackAvailable = true;
    }

    return recentEvents.filter((event) => event && rememberEventId(event.id));
  }

  function processFeedbackEvents(state) {
    const events = getNewFeedbackEvents(state);
    const observed = {
      damage: false,
      engage: false,
      kill: false
    };

    for (const event of events) {
      switch (event.type) {
        case "damage-taken":
          memory.telemetry.damageEventsObserved += 1;
          observed.damage = true;
          applyDamageReaction();
          break;
        case "enemy-hit":
          memory.telemetry.enemyHitEventsObserved += 1;
          observed.engage = true;
          memory.engageRemaining = Math.max(memory.engageRemaining, p.engageHoldTicks);
          break;
        case "kill":
          memory.telemetry.killEventsObserved += 1;
          observed.kill = true;
          memory.engageRemaining = Math.max(memory.engageRemaining, Math.max(1, p.engageHoldTicks));
          memory.postScoreHoldRemaining = Math.max(memory.postScoreHoldRemaining, p.postScoreHoldTicks);
          break;
        case "reload-start":
          memory.damagePauseRemaining = Math.max(memory.damagePauseRemaining, 1);
          memory.fireCycleTick = 0;
          break;
        case "reload-end":
          memory.fireCycleTick = 0;
          break;
        case "wave-complete":
          memory.postScoreHoldRemaining = Math.max(memory.postScoreHoldRemaining, 1);
          memory.pitchDirection *= -1;
          break;
        default:
          break;
      }
    }

    return observed;
  }

  function nextPitchScanDelta() {
    const step = clamp(
      p.pitchSweepAmplitudeDeg / Math.max(2, Math.round(p.pitchSweepPeriodTicks / 2)),
      0.05,
      Math.max(0.2, p.pitchSweepAmplitudeDeg)
    );
    const projected = memory.pitchOffsetDeg + (step * memory.pitchDirection);

    if (Math.abs(projected) > p.pitchSweepAmplitudeDeg) {
      memory.pitchDirection *= -1;
    }

    return step * memory.pitchDirection;
  }

  function recenterPitchDelta(scale = 0.4) {
    if (Math.abs(memory.pitchOffsetDeg) < 0.05) return 0;
    return clamp(
      -memory.pitchOffsetDeg * scale,
      -Math.max(0.25, p.pitchSweepAmplitudeDeg),
      Math.max(0.25, p.pitchSweepAmplitudeDeg)
    );
  }

  function nextAction(state) {
    memory.tickIndex += 1;

    const health = typeof state?.health === "number" ? state.health : null;
    const currentScore = Number(state?.score?.current ?? 0);
    const mag = Number(state?.ammo?.mag ?? 0);
    const reserve = Number(state?.ammo?.reserve ?? 0);
    const reloading = state?.ammo?.reloading === true;
    const feedbackObserved = processFeedbackEvents(state);

    if (health !== null && memory.lastHealth !== null && health < memory.lastHealth && !feedbackObserved.damage) {
      memory.telemetry.damageEventsObserved += 1;
      applyDamageReaction();
    }

    if (currentScore > memory.lastScore) {
      memory.postScoreHoldRemaining = Math.max(memory.postScoreHoldRemaining, p.postScoreHoldTicks);
      if (!feedbackObserved.kill) {
        memory.engageRemaining = Math.max(memory.engageRemaining, Math.max(1, p.engageHoldTicks));
      }
    }

    if (memory.tickIndex % p.strafePeriodTicks === 0) {
      memory.strafeSign *= -1;
    }

    if (memory.tickIndex % p.sweepPeriodTicks === 0) {
      memory.sweepDirection *= -1;
    }

    const cycleLength = Math.max(1, p.fireBurstCooldownTicks + p.settleTicks + p.fireBurstLengthTicks);
    const fireCycleTick = memory.fireCycleTick % cycleLength;
    memory.fireCycleTick += 1;

    const inOpening = memory.tickIndex <= p.openingNoFireTicks;
    const inPanic = memory.panicRemaining > 0;
    const inEngage = !inPanic && (memory.engageRemaining > 0 || memory.postScoreHoldRemaining > 0);
    const settleStart = p.fireBurstCooldownTicks;
    const fireStart = p.fireBurstCooldownTicks + p.settleTicks;
    const inSettleWindow = !inOpening && !inPanic && !inEngage && fireCycleTick >= settleStart;
    const inFireWindow = !inOpening && fireCycleTick >= fireStart;

    let mode = "scan";
    if (inPanic) {
      mode = "panic";
    } else if (inEngage) {
      mode = "engage";
    } else if (inOpening) {
      mode = "opening";
    } else if (inSettleWindow) {
      mode = "settle";
    }

    memory.telemetry.lastMode = mode;
    if (mode === "panic") {
      memory.telemetry.ticksInPanicMode += 1;
    }
    if (mode === "engage") {
      memory.telemetry.ticksInEngageMode += 1;
    }

    let moveX = p.strafeMagnitude * memory.strafeSign;
    let moveZ = p.forwardMove;
    let lookYawDelta = p.sweepAmplitudeDeg * memory.sweepDirection;
    let lookPitchDelta = nextPitchScanDelta();

    if (p.pauseEveryTicks > 0 && (memory.tickIndex % p.pauseEveryTicks) < p.pauseDurationTicks) {
      moveZ *= 0.2;
    }

    switch (mode) {
      case "opening":
        moveX *= 0.6;
        moveZ *= 0.5;
        lookYawDelta *= 0.7;
        lookPitchDelta *= 0.4;
        break;
      case "settle":
        moveX *= 0.45;
        moveZ *= 0.35;
        lookYawDelta *= 0.3;
        lookPitchDelta = clamp((lookPitchDelta * 0.2) + recenterPitchDelta(0.5), -1.5, 1.5);
        break;
      case "engage":
        moveX *= 0.25;
        moveZ *= 0.22;
        lookYawDelta *= 0.18;
        lookPitchDelta = clamp((lookPitchDelta * 0.1) + recenterPitchDelta(0.6), -1.2, 1.2);
        break;
      case "panic":
        moveX *= 1.25;
        moveZ *= 0.3;
        lookYawDelta += p.panicTurnDeg * -memory.strafeSign;
        lookPitchDelta = clamp(
          recenterPitchDelta(0.25) + (memory.strafeSign >= 0 ? 1 : -1) * p.panicPitchNudgeDeg,
          -Math.max(1.2, p.pitchSweepAmplitudeDeg),
          Math.max(1.2, p.pitchSweepAmplitudeDeg)
        );
        break;
      default:
        break;
    }

    let fire = false;
    if (!reloading && mag > 0) {
      if (mode === "engage") {
        fire = memory.damagePauseRemaining === 0;
      } else if (mode === "panic") {
        fire = memory.damagePauseRemaining === 0 && inFireWindow;
      } else if (mode === "settle") {
        fire = inFireWindow;
      }
    }

    if (fire || mode === "engage") {
      moveX *= p.fireMoveScale;
      moveZ *= p.fireMoveScale;
    }

    const reload = reserve > 0 && !reloading && mag <= p.reloadThreshold;
    if (reload) {
      fire = false;
    }

    const crouch = p.crouchEveryTicks > 0 && (memory.tickIndex % p.crouchEveryTicks) < 2;

    notePitch(lookPitchDelta);

    memory.lastHealth = health;
    memory.lastScore = currentScore;
    if (memory.damagePauseRemaining > 0) {
      memory.damagePauseRemaining -= 1;
    }
    if (memory.panicRemaining > 0) {
      memory.panicRemaining -= 1;
    }
    if (memory.engageRemaining > 0) {
      memory.engageRemaining -= 1;
    }
    if (memory.postScoreHoldRemaining > 0) {
      memory.postScoreHoldRemaining -= 1;
    }

    return {
      moveX: clamp(moveX, -1, 1),
      moveZ: clamp(moveZ, -1, 1),
      lookYawDelta,
      lookPitchDelta: clamp(lookPitchDelta, -6, 6),
      fire,
      reload,
      crouch
    };
  }

  return {
    family: "adaptive-sweeper",
    policy: p,
    resetEpisode,
    nextAction,
    getTelemetry() {
      return copyTelemetry(memory.telemetry);
    }
  };
}
