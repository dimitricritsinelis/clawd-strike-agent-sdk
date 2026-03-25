import {
  advance,
  applyAction,
  clickPlayAgainIfVisible,
  ensureFreshRun,
  isDead,
  isRuntimeReady,
  readState,
  waitForRespawn
} from "./browser.mjs";

export function createEpisodeRecord(policyEntry, episodeIndex, observation, controllerTelemetry = null) {
  const summary = observation?.lastRunSummary ?? {};
  const bestScore = Number(summary.bestScore ?? observation?.score?.best ?? 0);
  const finalScore = Number(summary.finalScore ?? observation?.score?.lastRun ?? 0);

  return {
    candidateId: policyEntry.id,
    candidateLabel: policyEntry.label,
    parentId: policyEntry.parentId ?? null,
    policyFamily: policyEntry.policy?.family ?? null,
    recordedAt: new Date().toISOString(),
    episodeIndex,
    finalScore,
    bestScore,
    survivalTimeS: Number(summary.survivalTimeS ?? 0),
    kills: Number(summary.kills ?? 0),
    headshots: Number(summary.headshots ?? 0),
    shotsFired: Number(summary.shotsFired ?? 0),
    shotsHit: Number(summary.shotsHit ?? 0),
    accuracy: Number(summary.accuracy ?? 0),
    deathCause: summary.deathCause ?? "unknown",
    lastRun: observation?.score?.lastRun ?? null,
    localBestImproved: finalScore > 0 && finalScore >= bestScore,
    controllerTelemetry: controllerTelemetry && typeof controllerTelemetry === "object"
      ? controllerTelemetry
      : null
  };
}

export async function runPolicyEpisodes(options) {
  const {
    page,
    controller,
    policyEntry,
    targetEpisodes,
    stepMs,
    maxStepsPerEpisode,
    onEpisodeRecorded
  } = options;

  if (!page) throw new Error("runPolicyEpisodes requires a Playwright page.");
  if (!controller || typeof controller.nextAction !== "function") {
    throw new Error("runPolicyEpisodes requires a controller with nextAction().");
  }

  await ensureFreshRun(page, { waitMs: stepMs });
  controller.resetEpisode?.();

  const episodes = [];
  let activeEpisodeIndex = 1;
  let stepCountThisEpisode = 0;

  while (episodes.length < targetEpisodes) {
    const observation = await readState(page);

    if (!isRuntimeReady(observation)) {
      await advance(page, stepMs);
      continue;
    }

    if (isDead(observation)) {
      const controllerTelemetry = controller.getTelemetry?.() ?? null;
      const episodeRecord = createEpisodeRecord(
        policyEntry,
        activeEpisodeIndex,
        observation,
        controllerTelemetry
      );
      episodes.push(episodeRecord);

      if (typeof onEpisodeRecorded === "function") {
        await onEpisodeRecorded(episodeRecord);
      }

      if (episodes.length >= targetEpisodes) {
        break;
      }

      let respawned = false;
      for (let waitTick = 0; waitTick < 200; waitTick += 1) {
        const clicked = await clickPlayAgainIfVisible(page);
        if (clicked) {
          await waitForRespawn(page);
          respawned = true;
          break;
        }

        await advance(page, stepMs);

        try {
          const nextState = await readState(page);
          if (isRuntimeReady(nextState) && !isDead(nextState)) {
            respawned = true;
            break;
          }
        } catch {
          // Ignore transient parse timing while waiting for respawn.
        }
      }

      if (!respawned) {
        throw new Error("Unable to restart after death.");
      }

      controller.resetEpisode?.();
      activeEpisodeIndex += 1;
      stepCountThisEpisode = 0;
      continue;
    }

    const action = controller.nextAction(observation);
    await applyAction(page, action);
    await advance(page, stepMs);

    stepCountThisEpisode += 1;
    if (stepCountThisEpisode > maxStepsPerEpisode) {
      throw new Error(
        `Policy '${policyEntry.label}' exceeded MAX_STEPS_PER_EPISODE=${maxStepsPerEpisode} without dying.`
      );
    }
  }

  return {
    episodes,
    aggregate: null
  };
}
