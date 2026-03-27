import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { writeLearningMemoryDocs } from "../src/learn/memory-docs.mjs";

test("memory doc writes are idempotent and preserve manual sections", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "clawd-memory-docs-"));
  const memoryPath = path.join(projectRoot, "MEMORY.md");
  const selfLearningPath = path.join(projectRoot, "SELF_LEARNING.md");

  await writeFile(memoryPath, "# MEMORY.md\n\nManual intro.\n\n## Manual notes\n\n- keep me\n", "utf8");
  await writeFile(selfLearningPath, "# SELF_LEARNING.md\n\nManual intro.\n\n## Manual notes\n\n- preserve me\n", "utf8");

  const payload = {
    championEntry: {
      id: 4,
      label: "candidate-4",
      aggregate: {
        episodesWithHit: 2,
        episodesWithKill: 1,
        totalShotsHit: 3,
        totalKills: 1,
        bestScore: 10,
        meanSurvivalTimeS: 4.8
      }
    },
    sessionSummary: {
      acquisitionMet: true,
      baselineMet: false,
      learningPhase: "bootstrap_kill",
      rejections: [{ reason: "candidate regressed meanSurvivalTimeS during kill-bootstrap" }],
      promotions: [{ reason: "candidate improved episodesWithHit during hit-bootstrap" }]
    },
    runConfig: {
      agentName: "DocBot",
      modelProvider: "metadata-only",
      modelName: "adaptive-sweeper",
      headless: true,
      attemptBudget: 30,
      timeBudgetMinutes: 15,
      learningEnabled: true
    },
    semanticMemory: {
      version: 2,
      notes: [{ text: "Pitch sweep improved acquisition." }],
      contactSignals: [{ summary: "Wide pitch ladder produced the earliest hit." }]
    },
    experimentQueue: ["Hold briefly after enemy-hit."],
    knownConstraints: ["Runtime wrappers stay locked by default."]
  };

  await writeLearningMemoryDocs(projectRoot, payload);
  await writeLearningMemoryDocs(projectRoot, payload);

  const memoryText = await readFile(memoryPath, "utf8");
  const selfLearningText = await readFile(selfLearningPath, "utf8");

  assert.equal(memoryText.match(/<!-- MEMORY_GENERATED:BEGIN -->/g)?.length ?? 0, 1);
  assert.equal(selfLearningText.match(/<!-- SELF_LEARNING_GENERATED:BEGIN -->/g)?.length ?? 0, 1);
  assert.match(memoryText, /## Manual notes/);
  assert.match(memoryText, /keep me/);
  assert.match(memoryText, /baseline milestone/);
  assert.match(selfLearningText, /preserve me/);
  assert.match(selfLearningText, /Wide pitch ladder produced the earliest hit/);
});
