import { LEARNING_PHASES, normalizeLearningPhase } from "../learn/phases.mjs";

const MODE_NAMES = Object.freeze([
  "opening",
  "acquire",
  "micro_scan",
  "engage",
  "panic",
  "recover"
]);

const PITCH_BAND_SEQUENCE = Object.freeze(["mid", "high", "mid", "low"]);

const EVENT_DECAY_TICKS = Object.freeze({
  "damage-taken": 10,
  "enemy-hit": 8,
  kill: 10,
  "wave-complete": 6,
  "reload-start": 5,
  "reload-end": 3,
  unknown: 4
});

const PHASE_SCALES = Object.freeze({
  [LEARNING_PHASES.BOOTSTRAP_HIT]: {
    acquireSweep: 1.2,
    acquirePitch: 1.15,
    forward: 0.95,
    engageBurst: 0.95,
    engageHold: 0.9
  },
  [LEARNING_PHASES.BOOTSTRAP_KILL]: {
    acquireSweep: 1,
    acquirePitch: 1,
    forward: 0.82,
    engageBurst: 1.15,
    engageHold: 1.15
  },
  [LEARNING_PHASES.STABILIZE_SCORE]: {
    acquireSweep: 0.95,
    acquirePitch: 0.9,
    forward: 0.88,
    engageBurst: 1,
    engageHold: 1
  }
});

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

function createZeroModeMap() {
  return {
    opening: 0,
    acquire: 0,
    micro_scan: 0,
    engage: 0,
    panic: 0,
    recover: 0
  };
}

function createZeroPitchBandMap() {
  return {
    low: 0,
    mid: 0,
    high: 0
  };
}

function createEmptyTelemetry(learningPhase) {
  return {
    learningPhase,
    feedbackAvailable: false,
    recentEventCounts: {},
    enemyHitEventsObserved: 0,
    killEventsObserved: 0,
    damageEventsObserved: 0,
    damageReactionCount: 0,
    ticksInEngageMode: 0,
    ticksInPanicMode: 0,
    estimatedPitchRangeDeg: 0,
    pitchBandVisits: createZeroPitchBandMap(),
    pitchAbsTravel: 0,
    yawAbsTravel: 0,
    scanDirectionFlips: 0,
    modeTicks: createZeroModeMap(),
    modeShots: createZeroModeMap(),
    burstCount: 0,
    avgBurstLength: 0,
    shotsWithinWindowAfterDamage: 0,
    shotsWithinWindowAfterHit: 0,
    timeToFirstDamageS: null,
    timeToFirstHitS: null,
    timeToFirstKillS: null,
    microScanCount: 0,
    lastMode: "opening"
  };
}

function copyTelemetry(telemetry) {
  return {
    learningPhase: telemetry.learningPhase,
    feedbackAvailable: Boolean(telemetry.feedbackAvailable),
    recentEventCounts: { ...(telemetry.recentEventCounts ?? {}) },
    enemyHitEventsObserved: Number(telemetry.enemyHitEventsObserved ?? 0),
    killEventsObserved: Number(telemetry.killEventsObserved ?? 0),
    damageEventsObserved: Number(telemetry.damageEventsObserved ?? 0),
    damageReactionCount: Number(telemetry.damageReactionCount ?? 0),
    ticksInEngageMode: Number(telemetry.ticksInEngageMode ?? 0),
    ticksInPanicMode: Number(telemetry.ticksInPanicMode ?? 0),
    estimatedPitchRangeDeg: Number(telemetry.estimatedPitchRangeDeg ?? 0),
    pitchBandVisits: { ...createZeroPitchBandMap(), ...(telemetry.pitchBandVisits ?? {}) },
    pitchAbsTravel: Number(telemetry.pitchAbsTravel ?? 0),
    yawAbsTravel: Number(telemetry.yawAbsTravel ?? 0),
    scanDirectionFlips: Number(telemetry.scanDirectionFlips ?? 0),
    modeTicks: { ...createZeroModeMap(), ...(telemetry.modeTicks ?? {}) },
    modeShots: { ...createZeroModeMap(), ...(telemetry.modeShots ?? {}) },
    burstCount: Number(telemetry.burstCount ?? 0),
    avgBurstLength: Number(telemetry.avgBurstLength ?? 0),
    shotsWithinWindowAfterDamage: Number(telemetry.shotsWithinWindowAfterDamage ?? 0),
    shotsWithinWindowAfterHit: Number(telemetry.shotsWithinWindowAfterHit ?? 0),
    timeToFirstDamageS: telemetry.timeToFirstDamageS ?? null,
    timeToFirstHitS: telemetry.timeToFirstHitS ?? null,
    timeToFirstKillS: telemetry.timeToFirstKillS ?? null,
    microScanCount: Number(telemetry.microScanCount ?? 0),
    lastMode: telemetry.lastMode ?? "opening"
  };
}

function normalizeEventType(rawType) {
  const lowered = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";

  switch (lowered) {
    case "damage-taken":
    case "damage_taken":
      return "damage-taken";
    case "enemy-hit":
    case "enemy_hit":
      return "enemy-hit";
    case "kill":
      return "kill";
    case "wave-complete":
    case "wave_complete":
      return "wave-complete";
    case "reload-start":
    case "reload_start":
      return "reload-start";
    case "reload-end":
    case "reload_end":
      return "reload-end";
    default:
      return "unknown";
  }
}

export const DEFAULT_ADAPTIVE_SWEEPER_POLICY = Object.freeze({
  family: "adaptive-sweeper",
  version: 3,
  forwardMove: 0.58,
  strafeMagnitude: 0.3,
  strafePeriodTicks: 14,
  sweepAmplitudeDeg: 1.85,
  sweepPeriodTicks: 16,
  pitchSweepAmplitudeDeg: 1.55,
  pitchSweepPeriodTicks: 14,
  openingNoFireTicks: 2,
  settleTicks: 2,
  fireBurstLengthTicks: 1,
  fireBurstCooldownTicks: 5,
  engageBurstLengthTicks: 4,
  engageBurstCooldownTicks: 1,
  fireMoveScale: 0.28,
  engageHoldTicks: 8,
  reloadThreshold: 4,
  panicTurnDeg: 7.5,
  panicTicks: 5,
  panicPitchNudgeDeg: 1.7,
  damagePauseTicks: 1,
  microScanTicks: 4,
  microScanYawDeg: 1.35,
  microScanPitchDeg: 0.8,
  damageScanMultiplier: 1.8,
  damageForwardScale: 0.14,
  damageStrafeScale: 1.6,
  crouchEveryTicks: 0,
  pauseEveryTicks: 0,
  pauseDurationTicks: 0,
  postScoreHoldTicks: 6,
  reverseOnDamage: true
});

export function normalizeAdaptiveSweeperPolicy(policy = {}) {
  const source = { ...DEFAULT_ADAPTIVE_SWEEPER_POLICY, ...policy };

  return {
    family: "adaptive-sweeper",
    version: 3,
    forwardMove: sanitizeNumber(source.forwardMove, 0.58, 0.2, 1),
    strafeMagnitude: sanitizeNumber(source.strafeMagnitude, 0.3, 0.05, 0.7),
    strafePeriodTicks: sanitizeInteger(source.strafePeriodTicks, 14, 4, 60),
    sweepAmplitudeDeg: sanitizeNumber(source.sweepAmplitudeDeg, 1.85, 0.2, 6),
    sweepPeriodTicks: sanitizeInteger(source.sweepPeriodTicks, 16, 4, 80),
    pitchSweepAmplitudeDeg: sanitizeNumber(source.pitchSweepAmplitudeDeg, 1.55, 0.1, 4),
    pitchSweepPeriodTicks: sanitizeInteger(source.pitchSweepPeriodTicks, 14, 6, 80),
    openingNoFireTicks: sanitizeInteger(source.openingNoFireTicks, 2, 0, 12),
    settleTicks: sanitizeInteger(source.settleTicks, 2, 0, 12),
    fireBurstLengthTicks: sanitizeInteger(source.fireBurstLengthTicks, 1, 1, 10),
    fireBurstCooldownTicks: sanitizeInteger(source.fireBurstCooldownTicks, 5, 0, 24),
    engageBurstLengthTicks: sanitizeInteger(source.engageBurstLengthTicks, 4, 1, 12),
    engageBurstCooldownTicks: sanitizeInteger(source.engageBurstCooldownTicks, 1, 0, 12),
    fireMoveScale: sanitizeNumber(source.fireMoveScale, 0.28, 0.15, 1),
    engageHoldTicks: sanitizeInteger(source.engageHoldTicks, 8, 0, 20),
    reloadThreshold: sanitizeInteger(source.reloadThreshold, 4, 0, 12),
    panicTurnDeg: sanitizeNumber(source.panicTurnDeg, 7.5, 1, 20),
    panicTicks: sanitizeInteger(source.panicTicks, 5, 1, 24),
    panicPitchNudgeDeg: sanitizeNumber(source.panicPitchNudgeDeg, 1.7, 0, 6),
    damagePauseTicks: sanitizeInteger(source.damagePauseTicks, 1, 0, 12),
    microScanTicks: sanitizeInteger(source.microScanTicks, 4, 1, 12),
    microScanYawDeg: sanitizeNumber(source.microScanYawDeg, 1.35, 0.2, 4),
    microScanPitchDeg: sanitizeNumber(source.microScanPitchDeg, 0.8, 0.1, 3),
    damageScanMultiplier: sanitizeNumber(source.damageScanMultiplier, 1.8, 1, 3),
    damageForwardScale: sanitizeNumber(source.damageForwardScale, 0.14, 0, 0.6),
    damageStrafeScale: sanitizeNumber(source.damageStrafeScale, 1.6, 0.8, 2),
    crouchEveryTicks: sanitizeInteger(source.crouchEveryTicks, 0, 0, 120),
    pauseEveryTicks: sanitizeInteger(source.pauseEveryTicks, 0, 0, 120),
    pauseDurationTicks: sanitizeInteger(source.pauseDurationTicks, 0, 0, 12),
    postScoreHoldTicks: sanitizeInteger(source.postScoreHoldTicks, 6, 0, 30),
    reverseOnDamage: Boolean(source.reverseOnDamage)
  };
}

export function createAdaptiveSweeperController(policy, options = {}) {
  const p = normalizeAdaptiveSweeperPolicy(policy);
  const learningPhase = normalizeLearningPhase(options.learningPhase);
  const phaseScale = PHASE_SCALES[learningPhase] ?? PHASE_SCALES[LEARNING_PHASES.BOOTSTRAP_HIT];
  const stepMs = Math.max(100, Math.round(Number(options.stepMs ?? 125)));
  const maxPitchEnvelope = Math.max(
    p.pitchSweepAmplitudeDeg * Math.max(1.5, p.damageScanMultiplier),
    p.microScanPitchDeg * 2
  );

  const memory = {
    tickIndex: 0,
    lastHealth: null,
    lastScore: 0,
    panicRemaining: 0,
    engageRemaining: 0,
    recoverRemaining: 0,
    postScoreHoldRemaining: 0,
    damagePauseRemaining: 0,
    microScanRemaining: 0,
    damageWindowRemaining: 0,
    hitWindowRemaining: 0,
    strafeSign: 1,
    sweepDirection: 1,
    pitchOffsetDeg: 0,
    minPitchOffsetDeg: 0,
    maxPitchOffsetDeg: 0,
    pitchBandCursor: 0,
    pitchBandHoldTicks: 0,
    burstActiveRemaining: 0,
    burstCooldownRemaining: 0,
    currentBurstMode: null,
    totalBurstTicks: 0,
    microScanDirection: 1,
    seenEventIds: new Set(),
    seenEventOrder: [],
    recentEvents: [],
    telemetry: createEmptyTelemetry(learningPhase)
  };

  function updateBurstAverage() {
    memory.telemetry.avgBurstLength = memory.telemetry.burstCount === 0
      ? 0
      : Number((memory.totalBurstTicks / memory.telemetry.burstCount).toFixed(3));
  }

  function resetEpisode() {
    memory.tickIndex = 0;
    memory.lastHealth = null;
    memory.lastScore = 0;
    memory.panicRemaining = 0;
    memory.engageRemaining = 0;
    memory.recoverRemaining = 0;
    memory.postScoreHoldRemaining = 0;
    memory.damagePauseRemaining = 0;
    memory.microScanRemaining = 0;
    memory.damageWindowRemaining = 0;
    memory.hitWindowRemaining = 0;
    memory.strafeSign = 1;
    memory.sweepDirection = 1;
    memory.pitchOffsetDeg = 0;
    memory.minPitchOffsetDeg = 0;
    memory.maxPitchOffsetDeg = 0;
    memory.pitchBandCursor = 0;
    memory.pitchBandHoldTicks = 0;
    memory.burstActiveRemaining = 0;
    memory.burstCooldownRemaining = 0;
    memory.currentBurstMode = null;
    memory.totalBurstTicks = 0;
    memory.microScanDirection = 1;
    memory.seenEventIds.clear();
    memory.seenEventOrder = [];
    memory.recentEvents = [];
    memory.telemetry = createEmptyTelemetry(learningPhase);
    memory.telemetry.pitchBandVisits.mid = 1;
  }

  function rememberEventId(rawId, fallbackKey = null) {
    const key = rawId === undefined || rawId === null ? fallbackKey : String(rawId);
    if (!key) return true;
    if (memory.seenEventIds.has(key)) {
      return false;
    }

    memory.seenEventIds.add(key);
    memory.seenEventOrder.push(key);
    if (memory.seenEventOrder.length > 256) {
      const oldest = memory.seenEventOrder.shift();
      if (oldest) {
        memory.seenEventIds.delete(oldest);
      }
    }

    return true;
  }

  function recordMode(mode) {
    memory.telemetry.lastMode = mode;
    memory.telemetry.modeTicks[mode] += 1;

    if (mode === "engage") {
      memory.telemetry.ticksInEngageMode += 1;
    }
    if (mode === "panic") {
      memory.telemetry.ticksInPanicMode += 1;
    }
    if (mode === "micro_scan") {
      memory.telemetry.microScanCount += 1;
    }
  }

  function recordFire(mode) {
    if (MODE_NAMES.includes(mode)) {
      memory.telemetry.modeShots[mode] += 1;
    }
    if (memory.damageWindowRemaining > 0) {
      memory.telemetry.shotsWithinWindowAfterDamage += 1;
    }
    if (memory.hitWindowRemaining > 0) {
      memory.telemetry.shotsWithinWindowAfterHit += 1;
    }
  }

  function noteYaw(delta) {
    memory.telemetry.yawAbsTravel = Number(
      (memory.telemetry.yawAbsTravel + Math.abs(delta)).toFixed(3)
    );
  }

  function notePitch(delta) {
    memory.pitchOffsetDeg = clamp(memory.pitchOffsetDeg + delta, -maxPitchEnvelope, maxPitchEnvelope);
    memory.minPitchOffsetDeg = Math.min(memory.minPitchOffsetDeg, memory.pitchOffsetDeg);
    memory.maxPitchOffsetDeg = Math.max(memory.maxPitchOffsetDeg, memory.pitchOffsetDeg);
    memory.telemetry.pitchAbsTravel = Number(
      (memory.telemetry.pitchAbsTravel + Math.abs(delta)).toFixed(3)
    );
    memory.telemetry.estimatedPitchRangeDeg = Number(
      (memory.maxPitchOffsetDeg - memory.minPitchOffsetDeg).toFixed(3)
    );
  }

  function markFirstTiming(key) {
    if (memory.telemetry[key] !== null) return;
    memory.telemetry[key] = Number((((memory.tickIndex - 1) * stepMs) / 1000).toFixed(3));
  }

  function pruneRecentEvents() {
    memory.recentEvents = memory.recentEvents.filter((entry) => entry.expiresAtTick > memory.tickIndex);
  }

  function pushRecentEvent(type) {
    const decay = EVENT_DECAY_TICKS[type] ?? EVENT_DECAY_TICKS.unknown;
    memory.recentEvents.push({
      type,
      expiresAtTick: memory.tickIndex + decay
    });
    memory.telemetry.recentEventCounts[type] = Number(memory.telemetry.recentEventCounts[type] ?? 0) + 1;
  }

  function countRecentEvents(type) {
    return memory.recentEvents.filter((entry) => entry.type === type).length;
  }

  function hasRecentEvent(type) {
    return countRecentEvents(type) > 0;
  }

  function flipSweepDirection(nextDirection = -memory.sweepDirection) {
    if (nextDirection !== memory.sweepDirection) {
      memory.telemetry.scanDirectionFlips += 1;
    }
    memory.sweepDirection = nextDirection;
  }

  function currentPitchBand() {
    return PITCH_BAND_SEQUENCE[memory.pitchBandCursor % PITCH_BAND_SEQUENCE.length];
  }

  function advancePitchBand() {
    memory.pitchBandCursor = (memory.pitchBandCursor + 1) % PITCH_BAND_SEQUENCE.length;
    memory.pitchBandHoldTicks = 0;
    memory.telemetry.pitchBandVisits[currentPitchBand()] += 1;
  }

  function nextAcquirePitchDelta(amplitude, options = {}) {
    const effectiveAmplitude = clamp(
      amplitude * (options.narrow ? 0.55 : 1),
      0.1,
      maxPitchEnvelope
    );
    const band = currentPitchBand();
    const target = band === "low"
      ? -effectiveAmplitude
      : band === "high"
        ? effectiveAmplitude
        : 0;
    const step = clamp(
      effectiveAmplitude / Math.max(2, Math.round(p.pitchSweepPeriodTicks / 5)),
      0.12,
      Math.max(0.45, effectiveAmplitude)
    );
    const delta = clamp(target - memory.pitchOffsetDeg, -step, step);

    memory.pitchBandHoldTicks += 1;
    if (
      Math.abs(target - memory.pitchOffsetDeg) <= 0.18
      || memory.pitchBandHoldTicks >= Math.max(2, Math.round(p.pitchSweepPeriodTicks / 4))
    ) {
      advancePitchBand();
    }

    return delta;
  }

  function recenterPitchDelta(scale = 0.6, limit = Math.max(0.5, p.pitchSweepAmplitudeDeg)) {
    if (Math.abs(memory.pitchOffsetDeg) < 0.05) {
      return 0;
    }

    return clamp(-memory.pitchOffsetDeg * scale, -limit, limit);
  }

  function getNewFeedbackEvents(state) {
    const recentEvents = Array.isArray(state?.feedback?.recentEvents) ? state.feedback.recentEvents : [];
    if (recentEvents.length > 0) {
      memory.telemetry.feedbackAvailable = true;
    }

    const normalized = [];
    for (let index = 0; index < recentEvents.length; index += 1) {
      const event = recentEvents[index];
      if (!event || typeof event !== "object") continue;

      const type = normalizeEventType(event.type);
      const fallbackId = event.id === undefined || event.id === null
        ? `tick-${memory.tickIndex}-${index}-${type}`
        : null;

      if (!rememberEventId(event.id, fallbackId)) {
        continue;
      }

      normalized.push({
        id: event.id ?? fallbackId,
        type,
        amount: Number.isFinite(event.amount) ? Number(event.amount) : null
      });
    }

    return normalized;
  }

  function applyDamageReaction() {
    memory.telemetry.damageReactionCount += 1;
    memory.panicRemaining = Math.max(memory.panicRemaining, Math.min(3, p.panicTicks));
    memory.microScanRemaining = Math.max(memory.microScanRemaining, p.microScanTicks);
    memory.recoverRemaining = Math.max(
      memory.recoverRemaining,
      Math.max(2, Math.round(p.microScanTicks / 2))
    );
    memory.damagePauseRemaining = Math.max(memory.damagePauseRemaining, p.damagePauseTicks);
    memory.damageWindowRemaining = Math.max(memory.damageWindowRemaining, 8);
    memory.hitWindowRemaining = Math.max(memory.hitWindowRemaining, 3);
    memory.microScanDirection = memory.strafeSign >= 0 ? 1 : -1;
    flipSweepDirection(-memory.sweepDirection);

    if (p.reverseOnDamage) {
      memory.strafeSign *= -1;
    }

    markFirstTiming("timeToFirstDamageS");
  }

  function processFeedbackEvents(state) {
    const events = getNewFeedbackEvents(state);
    const observed = {
      damage: false,
      hit: false,
      kill: false
    };

    for (const event of events) {
      pushRecentEvent(event.type);

      switch (event.type) {
        case "damage-taken":
          memory.telemetry.damageEventsObserved += 1;
          observed.damage = true;
          applyDamageReaction();
          break;
        case "enemy-hit":
          memory.telemetry.enemyHitEventsObserved += 1;
          observed.hit = true;
          memory.engageRemaining = Math.max(
            memory.engageRemaining,
            Math.round(p.engageHoldTicks * phaseScale.engageHold)
          );
          memory.hitWindowRemaining = Math.max(memory.hitWindowRemaining, 8);
          memory.recoverRemaining = 0;
          markFirstTiming("timeToFirstHitS");
          break;
        case "kill":
          memory.telemetry.killEventsObserved += 1;
          observed.kill = true;
          memory.engageRemaining = Math.max(
            memory.engageRemaining,
            Math.round((p.engageHoldTicks + 1) * phaseScale.engageHold)
          );
          memory.postScoreHoldRemaining = Math.max(memory.postScoreHoldRemaining, p.postScoreHoldTicks);
          memory.hitWindowRemaining = Math.max(memory.hitWindowRemaining, 10);
          markFirstTiming("timeToFirstKillS");
          break;
        case "reload-start":
          memory.recoverRemaining = Math.max(memory.recoverRemaining, 2);
          memory.burstActiveRemaining = 0;
          memory.burstCooldownRemaining = 1;
          break;
        case "reload-end":
          memory.burstActiveRemaining = 0;
          memory.burstCooldownRemaining = 0;
          break;
        case "wave-complete":
          memory.postScoreHoldRemaining = Math.max(memory.postScoreHoldRemaining, 1);
          advancePitchBand();
          flipSweepDirection(-memory.sweepDirection);
          break;
        default:
          break;
      }
    }

    return observed;
  }

  function startBurst(mode, length, cooldown) {
    memory.currentBurstMode = mode;
    memory.burstActiveRemaining = Math.max(0, length - 1);
    memory.burstCooldownRemaining = cooldown;
    memory.telemetry.burstCount += 1;
    memory.totalBurstTicks += length;
    updateBurstAverage();
    return true;
  }

  function nextBurstFire(mode, length, cooldown) {
    const boundedLength = clamp(Math.round(length), 1, 12);
    const boundedCooldown = clamp(Math.round(cooldown), 0, 24);

    if (memory.currentBurstMode !== mode) {
      memory.currentBurstMode = mode;
      memory.burstActiveRemaining = 0;
      memory.burstCooldownRemaining = 0;
    }

    if (memory.burstActiveRemaining > 0) {
      memory.burstActiveRemaining -= 1;
      return true;
    }

    if (memory.burstCooldownRemaining > 0) {
      memory.burstCooldownRemaining -= 1;
      return false;
    }

    return startBurst(mode, boundedLength, boundedCooldown);
  }

  function nextAction(state) {
    memory.tickIndex += 1;
    pruneRecentEvents();

    const health = typeof state?.health === "number" ? state.health : null;
    const currentScore = Number(state?.score?.current ?? 0);
    const mag = Number(state?.ammo?.mag ?? 0);
    const reserve = Number(state?.ammo?.reserve ?? 0);
    const reloading = state?.ammo?.reloading === true;
    const feedbackObserved = processFeedbackEvents(state);

    if (health !== null && memory.lastHealth !== null && health < memory.lastHealth && !feedbackObserved.damage) {
      memory.telemetry.damageEventsObserved += 1;
      pushRecentEvent("damage-taken");
      applyDamageReaction();
    }

    if (currentScore > memory.lastScore) {
      if (!feedbackObserved.kill) {
        pushRecentEvent("kill");
        markFirstTiming("timeToFirstKillS");
      }
      memory.engageRemaining = Math.max(
        memory.engageRemaining,
        Math.round((p.engageHoldTicks + 1) * phaseScale.engageHold)
      );
      memory.postScoreHoldRemaining = Math.max(memory.postScoreHoldRemaining, p.postScoreHoldTicks);
      memory.hitWindowRemaining = Math.max(memory.hitWindowRemaining, 8);
    }

    if (memory.tickIndex % p.strafePeriodTicks === 0) {
      memory.strafeSign *= -1;
    }

    if (memory.tickIndex % p.sweepPeriodTicks === 0) {
      flipSweepDirection(-memory.sweepDirection);
    }

    const recentDamage = hasRecentEvent("damage-taken");
    const recentHit = hasRecentEvent("enemy-hit");
    const recentKill = hasRecentEvent("kill");
    const recentReload = hasRecentEvent("reload-start");

    const inOpening = memory.tickIndex <= p.openingNoFireTicks;
    const inPanic = !inOpening && memory.panicRemaining > 0;
    const inMicroScan = !inOpening && !inPanic && memory.microScanRemaining > 0;
    const inEngage = !inOpening && !inPanic && !inMicroScan && (memory.engageRemaining > 0 || recentHit || recentKill);
    const inRecover = !inOpening && !inPanic && !inMicroScan && !inEngage
      && (memory.recoverRemaining > 0 || memory.postScoreHoldRemaining > 0 || recentReload);

    let mode = "acquire";
    if (inOpening) {
      mode = "opening";
    } else if (inPanic) {
      mode = "panic";
    } else if (inMicroScan) {
      mode = "micro_scan";
    } else if (inEngage) {
      mode = "engage";
    } else if (inRecover) {
      mode = "recover";
    }

    recordMode(mode);

    const damageScanBoost = recentDamage ? p.damageScanMultiplier : 1;
    let moveX = p.strafeMagnitude * memory.strafeSign;
    let moveZ = p.forwardMove * phaseScale.forward;
    let lookYawDelta = p.sweepAmplitudeDeg * phaseScale.acquireSweep * damageScanBoost * memory.sweepDirection;
    let lookPitchDelta = nextAcquirePitchDelta(p.pitchSweepAmplitudeDeg * phaseScale.acquirePitch);

    if (p.pauseEveryTicks > 0 && (memory.tickIndex % p.pauseEveryTicks) < p.pauseDurationTicks) {
      moveZ *= 0.2;
    }

    if (recentDamage) {
      moveX *= p.damageStrafeScale;
      moveZ *= p.damageForwardScale;
    } else if (recentHit) {
      moveX *= 1.1;
      moveZ *= 0.75;
    }

    switch (mode) {
      case "opening":
        moveX *= 0.75;
        moveZ *= 0.55;
        lookYawDelta *= 0.75;
        lookPitchDelta = nextAcquirePitchDelta(p.pitchSweepAmplitudeDeg * 0.75);
        break;
      case "recover":
        moveX *= 0.65;
        moveZ *= 0.3;
        lookYawDelta *= 0.45;
        lookPitchDelta = clamp(
          recenterPitchDelta(0.55) + (nextAcquirePitchDelta(p.pitchSweepAmplitudeDeg * 0.4, { narrow: true }) * 0.35),
          -1.4,
          1.4
        );
        break;
      case "engage":
        moveX *= 0.35;
        moveZ *= 0.18;
        lookYawDelta *= 0.2;
        lookPitchDelta = clamp(
          recenterPitchDelta(0.8, 0.9) + (nextAcquirePitchDelta(p.pitchSweepAmplitudeDeg * 0.28, { narrow: true }) * 0.15),
          -0.9,
          0.9
        );
        break;
      case "panic":
        moveX *= Math.max(1.15, p.damageStrafeScale);
        moveZ *= Math.max(0, p.damageForwardScale);
        lookYawDelta = (p.sweepAmplitudeDeg * 0.55 * memory.sweepDirection) + (p.panicTurnDeg * -memory.strafeSign);
        lookPitchDelta = clamp(
          recenterPitchDelta(0.35, 1.4) + (memory.strafeSign >= 0 ? 1 : -1) * p.panicPitchNudgeDeg,
          -Math.max(1.4, p.pitchSweepAmplitudeDeg),
          Math.max(1.4, p.pitchSweepAmplitudeDeg)
        );
        break;
      case "micro_scan":
        moveX *= Math.max(1.1, p.damageStrafeScale);
        moveZ *= p.damageForwardScale;
        lookYawDelta = (p.microScanYawDeg * memory.microScanDirection) + (memory.sweepDirection * 0.15);
        lookPitchDelta = clamp(
          recenterPitchDelta(0.65, Math.max(0.75, p.microScanPitchDeg))
            + (p.microScanPitchDeg * memory.microScanDirection * (memory.strafeSign >= 0 ? 1 : -1)),
          -Math.max(1.2, p.microScanPitchDeg * 1.5),
          Math.max(1.2, p.microScanPitchDeg * 1.5)
        );
        memory.microScanDirection *= -1;
        break;
      default:
        break;
    }

    let fire = false;
    if (!reloading && mag > 0) {
      const damagePause = recentDamage
        ? Math.max(0, memory.damagePauseRemaining - 1)
        : memory.damagePauseRemaining;

      if (damagePause === 0) {
        if (mode === "engage") {
          fire = nextBurstFire(
            mode,
            (p.engageBurstLengthTicks + (recentHit ? 1 : 0) + (recentKill ? 1 : 0)) * phaseScale.engageBurst,
            Math.max(0, p.engageBurstCooldownTicks - (recentHit || recentDamage ? 1 : 0))
          );
        } else if (mode === "micro_scan" || mode === "panic") {
          fire = nextBurstFire(
            mode,
            Math.max(p.fireBurstLengthTicks + 1, p.engageBurstLengthTicks - 1),
            Math.max(0, Math.min(p.fireBurstCooldownTicks, p.engageBurstCooldownTicks + 1) - 1)
          );
        } else if (mode === "acquire") {
          fire = nextBurstFire(
            mode,
            p.fireBurstLengthTicks,
            p.fireBurstCooldownTicks + (recentReload ? 2 : 0)
          );
        }
      }
    }

    if (fire) {
      recordFire(mode);
      moveX *= p.fireMoveScale;
      moveZ *= p.fireMoveScale;
    } else if (mode === "engage") {
      moveX *= p.fireMoveScale;
      moveZ *= p.fireMoveScale;
    }

    const reload = reserve > 0 && !reloading && mag <= p.reloadThreshold;
    if (reload) {
      fire = false;
    }

    const crouch = p.crouchEveryTicks > 0 && (memory.tickIndex % p.crouchEveryTicks) < 2;

    noteYaw(lookYawDelta);
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
    if (memory.recoverRemaining > 0) {
      memory.recoverRemaining -= 1;
    }
    if (memory.postScoreHoldRemaining > 0) {
      memory.postScoreHoldRemaining -= 1;
    }
    if (memory.microScanRemaining > 0) {
      memory.microScanRemaining -= 1;
    }
    if (memory.damageWindowRemaining > 0) {
      memory.damageWindowRemaining -= 1;
    }
    if (memory.hitWindowRemaining > 0) {
      memory.hitWindowRemaining -= 1;
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

  resetEpisode();

  return {
    family: "adaptive-sweeper",
    learningPhase,
    policy: p,
    resetEpisode,
    nextAction,
    getTelemetry() {
      return copyTelemetry(memory.telemetry);
    }
  };
}
