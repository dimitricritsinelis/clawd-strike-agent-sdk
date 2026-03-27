import crypto from "node:crypto";
import path from "node:path";
import { readdir } from "node:fs/promises";
import {
  appendJsonl,
  ensureDir,
  readJsonIfExists,
  writeJson,
  writeJsonExclusive
} from "../utils/fs.mjs";

const CANDIDATE_SUMMARY_FILENAME = /^(.*)\.json$/;

function compareIds(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

export function sanitizeCandidateId(candidateId) {
  const raw = String(candidateId ?? "").trim();
  if (!raw) return "";

  return raw
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function createLearningSessionId(prefix = "session") {
  const timestamp = new Date().toISOString()
    .replace(/[:-]/g, "")
    .replace(/\./g, "")
    .replace("T", "t")
    .replace("Z", "z");

  return sanitizeCandidateId(`${prefix}-${timestamp}-${crypto.randomUUID().slice(0, 8)}`);
}

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
    version: 2,
    notes: [],
    contactSignals: []
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
  const stem = sanitizeCandidateId(candidateId);
  if (!stem) {
    throw new Error(`Invalid candidate id '${candidateId}'.`);
  }
  return path.join(layout.candidateDir, `${stem}.json`);
}

export async function readCandidateSummaryIds(layout) {
  const entries = await readdir(layout.candidateDir, { withFileTypes: true }).catch(() => []);
  const ids = new Set();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    const matched = CANDIDATE_SUMMARY_FILENAME.exec(entry.name);
    if (matched) {
      ids.add(sanitizeCandidateId(matched[1]));
    }

    const summary = await readJsonIfExists(path.join(layout.candidateDir, entry.name), null);
    const candidateId = sanitizeCandidateId(summary?.candidate?.id ?? summary?.id ?? "");
    if (candidateId) {
      ids.add(candidateId);
    }
  }

  return [...ids].filter(Boolean).sort(compareIds);
}

export async function createCandidateIdAllocator(layout, options = {}) {
  const sessionId = sanitizeCandidateId(options.sessionId ?? createLearningSessionId("candidate"));
  const knownIds = new Set(await readCandidateSummaryIds(layout));
  let counter = 0;

  return function allocateCandidateId() {
    while (true) {
      const candidateId = `${sessionId}-${String(counter).padStart(4, "0")}`;
      counter += 1;

      if (knownIds.has(candidateId)) {
        continue;
      }

      knownIds.add(candidateId);
      return candidateId;
    }
  };
}

export async function deriveNextCandidateId(layout, persistedState = {}) {
  const ids = new Set();
  const addId = (value) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      ids.add(Math.max(0, Math.round(numeric)));
    }
  };

  const existingIds = await readCandidateSummaryIds(layout);
  for (const value of existingIds) {
    addId(value);
  }

  addId(persistedState?.champion?.id);
  for (const entry of Array.isArray(persistedState?.hallOfFame) ? persistedState.hallOfFame : []) {
    addId(entry?.id);
  }

  return ids.size === 0 ? 0 : Math.max(...ids) + 1;
}

export async function writeCandidateSummary(layout, candidateId, summary) {
  const filePath = candidateSummaryPath(layout, candidateId);

  try {
    await writeJsonExclusive(filePath, summary);
    return filePath;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(`Candidate summary already exists for id ${candidateId}: ${filePath}`);
    }
    throw error;
  }
}

export async function writeLatestSessionSummary(layout, summary) {
  await writeJson(layout.latestSessionSummaryPath, summary);
}

export async function writeScoreboard(layout, scoreboard) {
  await writeJson(layout.scoreboardPath, scoreboard);
}
