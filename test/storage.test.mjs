import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { basename } from "node:path";
import { mkdtemp } from "node:fs/promises";
import {
  candidateSummaryPath,
  createCandidateIdAllocator,
  deriveNextCandidateId,
  ensureLearningLayout,
  writeCandidateSummary
} from "../src/learn/storage.mjs";

test("legacy numeric candidate id derivation still respects on-disk numeric summaries", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "clawd-storage-"));
  const layout = await ensureLearningLayout(outputDir);

  await writeCandidateSummary(layout, "2", { candidate: { id: 2 } });
  await writeCandidateSummary(layout, "14", { candidate: { id: 14 } });

  const nextId = await deriveNextCandidateId(layout, {
    champion: { id: 6 },
    hallOfFame: [{ id: 9 }, { id: 11 }]
  });

  assert.equal(nextId, 15);
});

test("repeated sessions produce unique candidate ids and unique summary filenames", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "clawd-storage-"));
  const layout = await ensureLearningLayout(outputDir);

  const allocateSessionOne = await createCandidateIdAllocator(layout, { sessionId: "session-one" });
  const firstId = allocateSessionOne();
  const secondId = allocateSessionOne();
  await writeCandidateSummary(layout, firstId, { candidate: { id: firstId } });
  await writeCandidateSummary(layout, secondId, { candidate: { id: secondId } });

  const allocateSessionTwo = await createCandidateIdAllocator(layout, { sessionId: "session-two" });
  const thirdId = allocateSessionTwo();
  await writeCandidateSummary(layout, thirdId, { candidate: { id: thirdId } });

  assert.notEqual(firstId, secondId);
  assert.notEqual(secondId, thirdId);
  assert.notEqual(firstId, thirdId);
  assert.equal(basename(candidateSummaryPath(layout, firstId)), `${firstId}.json`);
  assert.equal(basename(candidateSummaryPath(layout, thirdId)), `${thirdId}.json`);
});

test("candidate summaries are written exclusively and never silently overwritten", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "clawd-storage-"));
  const layout = await ensureLearningLayout(outputDir);

  const summaryPath = await writeCandidateSummary(layout, "session-one-0007", {
    candidate: { id: "session-one-0007" }
  });

  assert.equal(basename(summaryPath), "session-one-0007.json");

  await assert.rejects(
    () => writeCandidateSummary(layout, "session-one-0007", {
      candidate: { id: "session-one-0007" }
    }),
    /already exists/
  );
});
