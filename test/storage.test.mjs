import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { basename } from "node:path";
import { mkdtemp } from "node:fs/promises";
import {
  candidateSummaryPath,
  deriveNextCandidateId,
  ensureLearningLayout,
  writeCandidateSummary
} from "../src/learn/storage.mjs";

test("next candidate id comes from on-disk summaries and persisted ids", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "clawd-storage-"));
  const layout = await ensureLearningLayout(outputDir);

  await writeCandidateSummary(layout, 2, { candidate: { id: 2 } });
  await writeCandidateSummary(layout, 14, { candidate: { id: 14 } });

  const nextId = await deriveNextCandidateId(layout, {
    champion: { id: 6 },
    hallOfFame: [{ id: 9 }, { id: 11 }]
  });

  assert.equal(nextId, 15);
});

test("candidate summary filenames are padded and existing ids are never overwritten", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "clawd-storage-"));
  const layout = await ensureLearningLayout(outputDir);

  const summaryPath = await writeCandidateSummary(layout, 7, { candidate: { id: 7 } });

  assert.equal(basename(summaryPath), "0007.json");
  assert.equal(candidateSummaryPath(layout, 12).endsWith("/0012.json"), true);

  await assert.rejects(
    () => writeCandidateSummary(layout, 7, { candidate: { id: 7 } }),
    /already exists/
  );
});
