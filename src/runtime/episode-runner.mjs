import { applyAction, releaseInputs, clickPlayAgainIfVisible, isDead, isRuntimeReady, readState, validatePublicObservation, compatibilityError, delay } from "./browser.mjs";
import { sanitizeEpisodeTiming, sanitizeEpisodeTimings } from "../learn/run-validation.mjs";

export function createEpisodeRecord(policyEntry, episodeIndex, observation, controllerTelemetry = null) {
  const summary = observation?.lastRunSummary ?? {};
  const score = summary.finalScore ?? observation?.score?.lastRun;
  if (!Number.isFinite(score) || score < 0
    || ["survivalTimeS", "kills", "shotsFired", "shotsHit"].some((key) => !Number.isFinite(summary[key]) || summary[key] < 0)
    || summary.shotsHit > summary.shotsFired) {
    throw compatibilityError("Completed death has missing or invalid score/combat summary metrics.");
  }
  const bestScore = Number(summary.bestScore ?? observation?.score?.best ?? 0);
  const finalScore = Number(summary.finalScore ?? observation?.score?.lastRun ?? 0);
  const survivalTimeS = Number(summary.survivalTimeS ?? 0);
  const telemetry = controllerTelemetry && typeof controllerTelemetry === "object"
    ? {
        ...controllerTelemetry,
        timeToFirstDamageS: sanitizeEpisodeTiming(controllerTelemetry.timeToFirstDamageS, survivalTimeS),
        timeToFirstHitS: sanitizeEpisodeTiming(controllerTelemetry.timeToFirstHitS, survivalTimeS),
        timeToFirstKillS: sanitizeEpisodeTiming(controllerTelemetry.timeToFirstKillS, survivalTimeS)
      }
    : null;

  return sanitizeEpisodeTimings({
    valid: true,
    completed: true,
    status: "completed",
    policyIdentity: policyEntry.policyIdentity ?? policyEntry.codeHash ?? policyEntry.id,
    candidateId: policyEntry.id,
    candidateLabel: policyEntry.label,
    parentId: policyEntry.parentId ?? null,
    learningPhase: policyEntry.learningPhase ?? null,
    policyFamily: policyEntry.policy?.family ?? null,
    recordedAt: new Date().toISOString(),
    episodeIndex,
    finalScore,
    bestScore,
    survivalTimeS,
    kills: Number(summary.kills ?? 0),
    headshots: Number(summary.headshots ?? 0),
    shotsFired: Number(summary.shotsFired ?? 0),
    shotsHit: Number(summary.shotsHit ?? 0),
    accuracy: Number.isFinite(summary.accuracy) ? summary.accuracy : summary.shotsFired > 0 ? summary.shotsHit / summary.shotsFired : 0,
    hitPositive: Number(summary.shotsHit ?? 0) > 0,
    killPositive: Number(summary.kills ?? 0) > 0,
    timeToFirstDamageS: sanitizeEpisodeTiming(telemetry?.timeToFirstDamageS, survivalTimeS),
    timeToFirstHitS: sanitizeEpisodeTiming(telemetry?.timeToFirstHitS, survivalTimeS),
    timeToFirstKillS: sanitizeEpisodeTiming(telemetry?.timeToFirstKillS, survivalTimeS),
    deathCause: summary.deathCause ?? "unknown",
    lastRun: observation?.score?.lastRun ?? null,
    localBestImproved: finalScore > 0 && finalScore >= bestScore,
    controllerTelemetry: telemetry
  });
}

export function publicExecutionIdentity(observation) {
  return {
    apiVersion: observation.apiVersion,
    contract: observation.contract,
    profile: observation.profile ?? observation.gameplay?.profile ?? null,
    tuning: observation.tuning ?? observation.gameplay?.tuning ?? null,
    profileId: observation.profileId ?? null,
    tuningId: observation.tuningId ?? null,
    gameRevision: observation.gameRevision ?? observation.buildId ?? null
  };
}

// Keep only bounded, documented public evidence, never the entire browser state.
function publicFrame(observation, action, elapsedMs) {
  return {
    elapsedMs,
    health: observation.health,
    ammo: observation.ammo,
    score: observation.score?.current,
    alive: observation.gameplay?.alive,
    perception: {
      movementBlocked: observation.perception.movementBlocked,
      visibleTargets: observation.perception.visibleTargets.slice(0, 16).map(({ id, yawOffsetDeg, pitchOffsetDeg }) => ({ id, yawOffsetDeg, pitchOffsetDeg }))
    },
    recentEvents: (Array.isArray(observation.feedback?.recentEvents) ? observation.feedback.recentEvents : [])
      .slice(-12).filter((event) => event && typeof event === "object")
      .map(({ id, type, amount }) => ({ id, type, amount })),
    action
  };
}

export async function runPolicyEpisodes(options) {
  const {
    page, controller, policyEntry, targetEpisodes, stepMs = 125,
    maxStepsPerEpisode = 2400,
    episodeTimeoutMs = maxStepsPerEpisode * stepMs,
    startupTimeoutMs = 20_000,
    deadlineMs = Infinity,
    signal,
    onEpisodeRecorded,
    adapter = { readState, applyAction, releaseInputs, clickPlayAgainIfVisible },
    clock = { now: Date.now, sleep: delay }
  } = options;
  if (!controller || typeof controller.nextAction !== "function") throw new Error("runPolicyEpisodes requires nextAction().");
  if (!Number.isInteger(targetEpisodes) || targetEpisodes < 1 || !Number.isFinite(stepMs) || stepMs <= 0
    || !Number.isFinite(episodeTimeoutMs) || episodeTimeoutMs <= 0) throw new Error("Invalid episode count or timing budget.");
  const episodes = [];
  let status = "completed", error = null, started = false, executionIdentity = null;
  let episodeStartedAt = null, transitionStartedAt = clock.now(), nextTickAt = clock.now(), lastActionAt = null;
  let tail = [], lastObservation = null;
  const stopped = () => signal?.aborted ? "stopped" : clock.now() >= deadlineMs ? "budget_exhausted" : null;
  const pause = async () => {
    const waitMs = Math.max(0, Math.min(stepMs, nextTickAt - clock.now(), deadlineMs - clock.now()));
    if (waitMs > 0) await clock.sleep(waitMs);
  };
  try {
    if (stopped()) status = stopped();
    else await adapter.releaseInputs(page);
    while (episodes.length < targetEpisodes && status === "completed") {
      if (stopped()) { status = stopped(); break; }
      const observation = await adapter.readState(page);
      lastObservation = observation;
      if (!isRuntimeReady(observation)) {
        await adapter.releaseInputs(page);
        if (started) { status = "runtime_error"; error = "Game left runtime during an active episode."; break; }
        if (clock.now() - transitionStartedAt >= startupTimeoutMs) { status = "startup_failure"; error = "Timed out waiting for a living runtime."; break; }
      } else {
        validatePublicObservation(observation);
        const identity = publicExecutionIdentity(observation);
        executionIdentity ??= identity;
        if (JSON.stringify(identity) !== JSON.stringify(executionIdentity)) {
          status = "contract_mismatch"; error = "Public game profile/tuning identity changed during the batch."; break;
        }
        if (isDead(observation)) {
          await adapter.releaseInputs(page);
          if (started) {
            tail.push(publicFrame(observation, null, clock.now() - episodeStartedAt));
            tail = tail.slice(-40);
            const record = {
              ...createEpisodeRecord(policyEntry, episodes.length + 1, observation, controller.getTelemetry?.()),
              executionIdentity,
              observationActionTail: tail
            };
            episodes.push(record);
            if (onEpisodeRecorded) await onEpisodeRecorded(record);
            started = false;
            episodeStartedAt = null;
            tail = [];
            transitionStartedAt = clock.now();
            if (episodes.length >= targetEpisodes) break;
          }
          if (stopped()) { status = stopped(); break; }
          if (clock.now() - transitionStartedAt >= startupTimeoutMs) { status = "startup_failure"; error = "Timed out waiting for retry/respawn."; break; }
          await adapter.clickPlayAgainIfVisible(page, { timeoutMs: Math.min(startupTimeoutMs - (clock.now() - transitionStartedAt), deadlineMs - clock.now()) });
        } else {
          if (!started) {
            controller.resetEpisode?.();
            episodeStartedAt = clock.now();
            lastActionAt = null;
            started = true;
          }
          if (clock.now() - episodeStartedAt >= episodeTimeoutMs) {
            status = "timeout"; error = `Episode exceeded ${episodeTimeoutMs}ms without a completed death.`; break;
          }
          const now = clock.now();
          const action = controller.nextAction(observation, { deltaMs: lastActionAt === null ? stepMs : now - lastActionAt, elapsedMs: now - episodeStartedAt });
          lastActionAt = now;
          tail.push(publicFrame(observation, action, now - episodeStartedAt));
          tail = tail.slice(-40);
          await adapter.applyAction(page, action);
        }
      }
      // Schedule against elapsed wall time; slow calls never cause a burst of catch-up actions.
      nextTickAt += stepMs;
      if (nextTickAt < clock.now()) nextTickAt = clock.now() + stepMs;
      await pause();
    }
  } catch (caught) {
    status = stopped() ?? caught.code ?? (started ? "runtime_error" : "startup_failure");
    error = caught.message;
  } finally {
    try { await adapter.releaseInputs(page); }
    catch (caught) { if (status === "completed") { status = "runtime_error"; error = `Failed to release held inputs: ${caught.message}`; } }
  }
  return {
    episodes, aggregate: null, status, error, executionIdentity,
    partialEpisode: started ? { completed: false, status, currentScore: lastObservation?.score?.current ?? null, elapsedMs: clock.now() - episodeStartedAt, observationActionTail: tail } : null
  };
}
