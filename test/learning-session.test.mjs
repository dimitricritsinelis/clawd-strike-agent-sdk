import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runLearningSession } from "../examples/self-improving-runner.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sdk-session-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const policyPath = path.join(root, "policy.mjs");
  await writeFile(policyPath, 'export const createVisibleTargetController = () => ({ nextAction() { return {}; } });\n');
  const config = { mode: "learn", outputDir: path.join(root, "output"), baseUrl: "http://fixture.invalid/", headless: true,
    agentName: "Test", stepMs: 125, maxStepsPerEpisode: 2400, timeBudgetMinutes: 1,
    attemptBudget: 10, batchEpisodes: 5, learningEnabled: true };
  const dependencies = { policyPath, launchBrowser: async () => ({ page: {}, context: { close: async () => {} }, browser: { close: async () => {} } }),
    gotoAgentRuntime: async () => {}, releaseInputs: async () => {} };
  const read = async (file) => JSON.parse(await readFile(path.join(config.outputDir, file), "utf8"));
  const episodes = async () => (await readFile(path.join(config.outputDir, "episodes.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const run = async (scores, options = {}) => {
    let batch = 0;
    return runLearningSession(config, { ...dependencies, runPolicyEpisodes: async ({ targetEpisodes, onEpisodeRecorded }) => {
      const index = batch++;
      const count = options.partial ? 1 : targetEpisodes;
      const result = Array.from({ length: count }, (_, episodeIndex) => ({ completed: true, status: "completed", valid: true,
        episodeIndex: episodeIndex + 1, finalScore: scores[index] ?? scores[0], kills: 1, shotsHit: 1, shotsFired: 2,
        survivalTimeS: 10, executionIdentity: { profile: options.changedIdentity && index ? "other" : "test" } }));
      for (const episode of result) await onEpisodeRecorded(episode);
      return { episodes: result, status: options.partial ? "budget_exhausted" : "completed" };
    } });
  };
  return { config, dependencies, policyPath, read, episodes, run };
}

test("repeated invocations append history, preserve evidence and resume the accepted code", async (t) => {
  const f = await fixture(t);
  const first = await f.run([10]);
  assert.equal(first.completedAttempts, 5);
  const original = await f.read("champion-policy.json");
  const oldSummaryName = (await readdir(path.join(f.config.outputDir, "candidate-summaries")))[0];
  const oldSummaryPath = path.join(f.config.outputDir, "candidate-summaries", oldSummaryName);
  const oldSummary = await readFile(oldSummaryPath, "utf8");
  const second = await f.run([10]);
  assert.equal(second.decision.promote, false);
  assert.equal((await f.episodes()).length, 10);
  assert.deepEqual(await f.read("champion-policy.json"), original);
  assert.equal(await readFile(oldSummaryPath, "utf8"), oldSummary);
  assert.equal((await readdir(path.join(f.config.outputDir, "candidate-summaries"))).length, 2);
});

test("source edits compare freshly rerun champion; higher score promotes a recoverable snapshot", async (t) => {
  const f = await fixture(t);
  await f.run([100]);
  const original = await f.read("champion-policy.json");
  await writeFile(f.policyPath, `${original.source}\n// One behavior edit for the fixture.\n`);
  const session = await f.run([10, 20]);
  assert.equal(session.decision.promote, true);
  const saved = await f.read("champion-policy.json");
  assert.notEqual(saved.id, original.id);
  assert.equal(saved.source, await readFile(f.policyPath, "utf8"));
  assert.equal(session.evaluations[0].aggregate.meanScore, 10);
  assert.equal((await f.read("scoreboard.json")).bestEver.finalScore, 100);
});

test("ties and changed public conditions retain champion", async (t) => {
  const f = await fixture(t);
  await f.run([5]);
  const original = await f.read("champion-policy.json");
  await writeFile(f.policyPath, `${original.source}\n// Edited candidate\n`);
  assert.equal((await f.run([5, 5])).decision.promote, false);
  assert.equal((await f.run([5, 50], { changedIdentity: true })).decision.promote, false);
  assert.deepEqual(await f.read("champion-policy.json"), original);
});

test("attempt budget cannot promote a partial comparison, completed records survive time budget", async (t) => {
  const f = await fixture(t);
  await f.run([5]);
  const original = await f.read("champion-policy.json");
  await writeFile(f.policyPath, `${original.source}\n// Edited candidate\n`);
  f.config.attemptBudget = 7;
  const unequal = await f.run([5, 50]);
  assert.equal(unequal.completedAttempts, 7);
  assert.equal(unequal.decision.promote, false);
  const partial = await f.run([60], { partial: true });
  assert.equal(partial.stopReason, "budget_exhausted");
  assert.equal(partial.completedAttempts, 1);
  assert.equal(partial.decision.promote, false);
  assert.equal(partial.failed, false);
  assert.equal((await f.episodes()).length, 13);
  assert.deepEqual(await f.read("champion-policy.json"), original);
});

test("failure before recovery preserves best score and accepted state", async (t) => {
  const f = await fixture(t);
  await f.run([42]);
  const scoreboard = await f.read("scoreboard.json");
  const champion = await f.read("champion-policy.json");
  const result = await runLearningSession(f.config, { ...f.dependencies, policyPath: path.join(f.config.outputDir, "missing.mjs") });
  assert.equal(result.failed, true);
  assert.equal(result.stopReason, "startup_failure");
  assert.deepEqual(await f.read("scoreboard.json"), scoreboard);
  assert.deepEqual(await f.read("champion-policy.json"), champion);
});

test("startup budget termination is a normal stop", async (t) => {
  const f = await fixture(t);
  const result = await runLearningSession(f.config, { ...f.dependencies,
    gotoAgentRuntime: async () => { throw Object.assign(new Error("Time budget exhausted"), { code: "budget_exhausted" }); } });
  assert.equal(result.stopReason, "budget_exhausted");
  assert.equal(result.failed, false);
  assert.equal(result.completedAttempts, 0);
});
