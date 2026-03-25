import path from "node:path";
import { readdir } from "node:fs/promises";
import {
  appendJsonl,
  ensureDir,
  fileExists,
  readJsonIfExists,
  writeJson
} from "../utils/fs.mjs";

const CANDIDATE_SUMMARY_FILENAME = /^(\d+)\.json$/;

export async function ensureLearningLayout(outputDir) {
  await ensureDir(outputDir);
  await ensureDir(path.join(outputDir, "candidate-summaries"));

  return {
    outputDir,
    episodesPath: path.join(outputDir, "episodes.jsonl"),
    championPath: path.join(outputDir, "champion-policy.json"),
    semanticPath: path.join(outputDir, "semantic-memory.json"),
    hallOfFamePath: path.join(outputDir, "hall-of-fame.json"),
    scoreboardPath: path.join(outputDir, "scoreboard.json"),
    latestSessionSummaryPath: path.join(outputDir, "latest-session-summary.json"),
    resolvedRunConfigPath: path.join(outputDir, "resolved-run-config.json"),
    candidateDir: path.join(outputDir, "candidate-summaries")
  };
}

export async function loadLearningState(layout) {
  const champion = await readJsonIfExists(layout.championPath, null);
  const semanticMemory = await readJsonIfExists(layout.semanticPath, {
    version: 1,
    notes: []
  });
  const hallOfFame = await readJsonIfExists(layout.hallOfFamePath, []);

  return { champion, semanticMemory, hallOfFame };
}

export async function recordEpisode(layout, episode) {
  await appendJsonl(layout.episodesPath, episode);
}

export async function writeChampion(layout, champion) {
  await writeJson(layout.championPath, champion);
}

export async function writeSemanticMemory(layout, semanticMemory) {
  await writeJson(layout.semanticPath, semanticMemory);
}

export async function writeHallOfFame(layout, hallOfFame) {
  await writeJson(layout.hallOfFamePath, hallOfFame);
}

export function candidateSummaryPath(layout, candidateId) {
  const numericId = Math.max(0, Math.round(Number(candidateId) || 0));
  return path.join(layout.candidateDir, `${String(numericId).padStart(4, "0")}.json`);
}

export async function readCandidateSummaryIds(layout) {
  const entries = await readdir(layout.candidateDir, { withFileTypes: true }).catch(() => []);
  const ids = new Set();

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const matched = CANDIDATE_SUMMARY_FILENAME.exec(entry.name);
    if (matched) {
      ids.add(Number(matched[1]));
    }

    if (!entry.name.endsWith(".json")) continue;

    const summary = await readJsonIfExists(path.join(layout.candidateDir, entry.name), null);
    const candidateId = Number(summary?.candidate?.id ?? summary?.id ?? NaN);
    if (Number.isFinite(candidateId)) {
      ids.add(Math.max(0, Math.round(candidateId)));
    }
  }

  return [...ids].sort((left, right) => left - right);
}

export async function deriveNextCandidateId(layout, persistedState = {}) {
  const ids = new Set(await readCandidateSummaryIds(layout));
  const addId = (value) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      ids.add(Math.max(0, Math.round(numeric)));
    }
  };

  addId(persistedState?.champion?.id);
  for (const entry of Array.isArray(persistedState?.hallOfFame) ? persistedState.hallOfFame : []) {
    addId(entry?.id);
  }

  return ids.size === 0 ? 0 : Math.max(...ids) + 1;
}

export async function writeCandidateSummary(layout, candidateId, summary) {
  const filePath = candidateSummaryPath(layout, candidateId);
  if (await fileExists(filePath)) {
    throw new Error(`Candidate summary already exists for id ${candidateId}: ${filePath}`);
  }
  await writeJson(filePath, summary);
  return filePath;
}

export async function writeLatestSessionSummary(layout, summary) {
  await writeJson(layout.latestSessionSummaryPath, summary);
}

export async function writeScoreboard(layout, scoreboard) {
  await writeJson(layout.scoreboardPath, scoreboard);
}
