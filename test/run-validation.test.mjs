import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import {
  collectEpisodeTimingIssues,
  evaluateStarterBenchmark,
  sanitizeEpisodeTimings,
  validateLearningOutputs,
  writeJson
} from "../src/index.mjs";

test("sanitizeEpisodeTimings drops impossible time-to-first values", () => {
  const episode = sanitizeEpisodeTimings({
    episodeIndex: 3,
    survivalTimeS: 7.1,
    timeToFirstDamageS: 21.125,
    timeToFirstHitS: 2.4,
    controllerTelemetry: {
      timeToFirstDamageS: 21.125,
      timeToFirstHitS: 2.4
    }
  });

  assert.equal(episode.timeToFirstDamageS, null);
  assert.equal(episode.timeToFirstHitS, 2.4);
  assert.equal(episode.controllerTelemetry.timeToFirstDamageS, null);
  assert.equal(sanitizeEpisodeTimings({
    survivalTimeS: 5,
    timeToFirstHitS: null
  }).timeToFirstHitS, null);

  const issues = collectEpisodeTimingIssues([episode]);
  assert.equal(issues.length, 0);
});

test("validateLearningOutputs checks required files and candidate summaries", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "clawd-run-validation-"));
  const outputDir = path.join(projectRoot, "output/self-improving-runner");

  await writeJson(path.join(outputDir, "champion-policy.json"), { id: "seed" });
  await writeJson(path.join(outputDir, "episodes.jsonl"), { ok: true });
  await writeJson(path.join(outputDir, "latest-session-summary.json"), { ok: true });
  await writeJson(path.join(outputDir, "scoreboard.json"), { bestEver: null });
  await writeJson(path.join(outputDir, "candidate-summaries", "candidate-001.json"), { ok: true });

  const result = await validateLearningOutputs(outputDir);
  assert.equal(result.ok, true);
  assert.equal(result.candidateSummaryCount, 1);
});

test("evaluateStarterBenchmark fails loudly when acquisition or kill baseline is missing", () => {
  const acquisitionFailure = evaluateStarterBenchmark({
    acquisitionMet: false,
    baselineMet: false
  });
  assert.equal(acquisitionFailure.passed, false);
  assert.match(acquisitionFailure.reason, /hit-positive evidence/);

  const killFailure = evaluateStarterBenchmark({
    acquisitionMet: true,
    baselineMet: false
  });
  assert.equal(killFailure.passed, false);
  assert.match(killFailure.reason, /kill-positive evidence/);
});
