import path from "node:path";
import { launchBrowser, gotoAgentRuntime, ensureFreshRun, releaseInputs, attachConsoleRecorder } from "../src/runtime/browser.mjs";
import { runPolicyEpisodes } from "../src/runtime/episode-runner.mjs";
import { resolveSmokeConfig, persistResolvedConfig } from "../src/runtime/config.mjs";
import { createVisibleTargetController } from "../src/policies/visible-target.mjs";
import { ensureLearningLayout, recordEpisode } from "../src/learn/storage.mjs";
import { writeJson } from "../src/utils/fs.mjs";

const config = await resolveSmokeConfig();
const layout = await ensureLearningLayout(config.outputDir);
await persistResolvedConfig(config.outputDir, config);
const deadlineMs = config.timeBudgetMinutes > 0 ? Date.now() + config.timeBudgetMinutes * 60_000 : Infinity;
const abort = new AbortController();
const stop = () => abort.abort();
process.on("SIGINT", stop); process.on("SIGTERM", stop);
let resources, recorder;
const summary = { config, startedAt: new Date().toISOString(), deathsObserved: 0, respawnsObserved: 0 };
try {
  resources = await launchBrowser({ headless: config.headless, viewport: config.viewport, timeoutMs: Math.min(30_000, deadlineMs - Date.now()), deadlineMs, signal: abort.signal });
  recorder = attachConsoleRecorder(resources.page);
  await gotoAgentRuntime(resources.page, { ...config, deadlineMs, signal: abort.signal });
  await resources.page.screenshot({ path: path.join(config.outputDir, "runtime-start.png") });
  const result = await runPolicyEpisodes({
    page: resources.page, controller: createVisibleTargetController(),
    policyEntry: { id: "visible-target-smoke", label: "smoke" },
    targetEpisodes: Math.min(config.requiredSmokeDeaths, config.attemptBudget), stepMs: config.stepMs,
    maxStepsPerEpisode: config.smokeMaxSteps, deadlineMs, signal: abort.signal,
    onEpisodeRecorded: async (episode) => {
      await recordEpisode(layout, episode);
      summary.deathsObserved += 1;
      // Every death after the first proves that the shared controller retried successfully.
      summary.respawnsObserved = summary.deathsObserved - 1;
    }
  });
  summary.status = result.status;
  summary.error = result.error;
  summary.partialEpisode = result.partialEpisode;
  if (result.status === "completed") {
    await resources.page.screenshot({ path: path.join(config.outputDir, "death.png") });
    await ensureFreshRun(resources.page, { waitMs: config.stepMs, deadlineMs, signal: abort.signal });
    summary.respawnsObserved += 1;
    await resources.page.screenshot({ path: path.join(config.outputDir, "respawn.png") });
  }
  summary.passed = result.status === "completed" && summary.deathsObserved >= config.requiredSmokeDeaths
    && summary.respawnsObserved >= config.requiredSmokeDeaths;
} catch (error) {
  summary.status = error.code ?? "startup_failure";
  summary.error = error.message;
  summary.passed = false;
} finally {
  if (resources) {
    try { if (!resources.page.isClosed?.()) await releaseInputs(resources.page); }
    catch (error) { summary.passed = false; summary.error ??= error.message; }
    await resources.context.close(); await resources.browser.close();
  }
  process.off("SIGINT", stop); process.off("SIGTERM", stop);
  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(config.outputDir, "summary.json"), summary);
  await writeJson(path.join(config.outputDir, "console.json"), recorder?.snapshot() ?? []);
}
console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exitCode = 1;
