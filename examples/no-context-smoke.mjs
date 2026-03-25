import path from "node:path";
import {
  advance,
  applyAction,
  attachConsoleRecorder,
  clickPlayAgainIfVisible,
  ensureDir,
  getAgentApiStatus,
  gotoAgentRuntime,
  launchBrowser,
  persistResolvedConfig,
  readState,
  resolveSmokeConfig,
  waitForRespawn,
  writeJson
} from "../src/index.mjs";

const config = await resolveSmokeConfig();
await ensureDir(config.outputDir);
await persistResolvedConfig(config.outputDir, config);

const { browser, context, page } = await launchBrowser({ headless: config.headless });
const consoleRecorder = attachConsoleRecorder(page);

const summary = {
  mode: "smoke",
  baseUrl: config.baseUrl,
  headless: config.headless,
  requiredDeaths: config.requiredSmokeDeaths,
  maxSteps: config.smokeMaxSteps,
  stepMs: config.stepMs,
  startedAt: new Date().toISOString(),
  runtime: {
    apiStatus: null,
    deathsObserved: 0,
    respawnsObserved: 0,
    cycles: []
  }
};

try {
  await gotoAgentRuntime(page, {
    baseUrl: config.baseUrl,
    agentName: `${config.agentName}-Smoke`
  });

  summary.runtime.apiStatus = await getAgentApiStatus(page);

  if (!summary.runtime.apiStatus.agentApplyAction) {
    throw new Error("Smoke check failed: agent_apply_action is unavailable.");
  }
  if (!summary.runtime.apiStatus.agentObserve && !summary.runtime.apiStatus.renderGameToText) {
    throw new Error("Smoke check failed: no public state reader is available.");
  }

  await page.screenshot({ path: path.join(config.outputDir, "runtime-start.png") });

  let previousAlive = true;

  for (let step = 0; step < config.smokeMaxSteps && summary.runtime.deathsObserved < config.requiredSmokeDeaths; step += 1) {
    const state = await readState(page);
    const alive = state.gameplay?.alive === true;
    const gameOverVisible = state.gameplay?.gameOverVisible === true;

    if (!alive || gameOverVisible) {
      const deathSummary = {
        deathIndex: summary.runtime.deathsObserved + 1,
        lastRun: state.score?.lastRun ?? null,
        best: state.score?.best ?? null,
        lastRunSummary: state.lastRunSummary ?? null
      };

      if (previousAlive) {
        summary.runtime.deathsObserved += 1;
        summary.runtime.cycles.push(deathSummary);
        await page.screenshot({ path: path.join(config.outputDir, `death-${deathSummary.deathIndex}.png`) });
      }

      const clicked = await clickPlayAgainIfVisible(page);
      if (!clicked) {
        previousAlive = false;
        await advance(page, config.stepMs);
        continue;
      }

      const restartedState = await waitForRespawn(page);
      if ((restartedState.score?.current ?? null) !== 0) {
        throw new Error(`Restarted run score should reset to 0, got ${restartedState.score?.current ?? "n/a"}`);
      }

      summary.runtime.respawnsObserved += 1;
      await page.screenshot({
        path: path.join(config.outputDir, `respawn-${summary.runtime.respawnsObserved}.png`)
      });

      previousAlive = true;
      continue;
    }

    previousAlive = alive;

    await applyAction(page, {
      moveX: step % 60 < 30 ? 0.25 : -0.2,
      moveZ: 1,
      lookYawDelta: step % 2 === 0 ? 1.35 : -0.7,
      fire: step % 10 === 0
    });

    await advance(page, config.stepMs);
  }

  if (summary.runtime.deathsObserved < config.requiredSmokeDeaths) {
    throw new Error(
      `Observed ${summary.runtime.deathsObserved} deaths; expected ${config.requiredSmokeDeaths}.`
    );
  }

  if (consoleRecorder.counts().errorCount > 0) {
    throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
  }

  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(config.outputDir, "summary.json"), summary);
  await writeJson(path.join(config.outputDir, "console.json"), {
    events: consoleRecorder.snapshot(),
    counts: consoleRecorder.counts()
  });

  console.log(
    `[smoke:no-context] pass | deaths=${summary.runtime.deathsObserved} | respawns=${summary.runtime.respawnsObserved} | output=${config.outputDir}`
  );
} catch (error) {
  summary.finishedAt = new Date().toISOString();
  summary.failed = true;
  summary.failure = error instanceof Error ? error.message : String(error);

  await writeJson(path.join(config.outputDir, "summary.json"), summary);
  await writeJson(path.join(config.outputDir, "console.json"), {
    events: consoleRecorder.snapshot(),
    counts: consoleRecorder.counts()
  });

  throw error;
} finally {
  await context.close();
  await browser.close();
}
