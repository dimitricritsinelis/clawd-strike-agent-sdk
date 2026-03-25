import path from "node:path";
import {
  aggregateEpisodes,
  attachConsoleRecorder,
  createAdaptiveSweeperController,
  ensureDir,
  gotoAgentRuntime,
  launchBrowser,
  loadDefaultPolicy,
  persistResolvedConfig,
  resolveBaselineConfig,
  runPolicyEpisodes,
  writeJson
} from "../src/index.mjs";

const config = await resolveBaselineConfig();
await ensureDir(config.outputDir);
await persistResolvedConfig(config.outputDir, config);

const policy = await loadDefaultPolicy();
const policyEntry = {
  id: 0,
  label: "baseline",
  parentId: null,
  policy
};

const { browser, context, page } = await launchBrowser({ headless: config.headless });
const consoleRecorder = attachConsoleRecorder(page);

const sessionSummary = {
  mode: "baseline",
  startedAt: new Date().toISOString(),
  baseUrl: config.baseUrl,
  agentName: config.agentName,
  modelProvider: config.modelProvider,
  modelName: config.modelName,
  headless: config.headless,
  stepMs: config.stepMs,
  targetEpisodes: config.targetEpisodes,
  outputDir: config.outputDir
};

try {
  await gotoAgentRuntime(page, {
    baseUrl: config.baseUrl,
    agentName: `${config.agentName}-Baseline`
  });

  const controller = createAdaptiveSweeperController(policy);
  const evaluation = await runPolicyEpisodes({
    page,
    controller,
    policyEntry,
    targetEpisodes: config.targetEpisodes,
    stepMs: config.stepMs,
    maxStepsPerEpisode: config.maxStepsPerEpisode
  });

  const aggregate = aggregateEpisodes(evaluation.episodes);

  sessionSummary.finishedAt = new Date().toISOString();
  sessionSummary.aggregate = aggregate;
  sessionSummary.episode = evaluation.episodes[0] ?? null;
  sessionSummary.console = consoleRecorder.counts();

  if (consoleRecorder.counts().errorCount > 0) {
    throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
  }

  await writeJson(path.join(config.outputDir, "latest-session-summary.json"), sessionSummary);
  await writeJson(path.join(config.outputDir, "latest-episode.json"), evaluation.episodes[0] ?? null);

  console.log(JSON.stringify({
    aggregate,
    outputDir: config.outputDir
  }, null, 2));
} catch (error) {
  sessionSummary.finishedAt = new Date().toISOString();
  sessionSummary.failed = true;
  sessionSummary.failure = error instanceof Error ? error.message : String(error);
  sessionSummary.console = consoleRecorder.counts();

  await writeJson(path.join(config.outputDir, "latest-session-summary.json"), sessionSummary);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
