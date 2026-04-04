import path from "node:path";
import { readdir } from "node:fs/promises";
import { fileExists, readJsonIfExists } from "../utils/fs.mjs";

export const REQUIRED_LEARNING_OUTPUT_FILES = Object.freeze([
  "champion-policy.json",
  "episodes.jsonl",
  "latest-session-summary.json"
]);

export function sanitizeEpisodeTiming(value, survivalTimeS) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  const survival = Number(survivalTimeS);
  if (!Number.isFinite(survival) || survival < 0) {
    return numeric;
  }

  return numeric <= survival + 1e-6 ? numeric : null;
}

export function sanitizeEpisodeTimings(episode = {}) {
  const survivalTimeS = Number(episode?.survivalTimeS ?? 0);
  const controllerTelemetry = episode?.controllerTelemetry && typeof episode.controllerTelemetry === "object"
    ? { ...episode.controllerTelemetry }
    : null;

  const sanitized = {
    ...episode,
    timeToFirstDamageS: sanitizeEpisodeTiming(episode?.timeToFirstDamageS, survivalTimeS),
    timeToFirstHitS: sanitizeEpisodeTiming(episode?.timeToFirstHitS, survivalTimeS),
    timeToFirstKillS: sanitizeEpisodeTiming(episode?.timeToFirstKillS, survivalTimeS)
  };

  if (controllerTelemetry) {
    controllerTelemetry.timeToFirstDamageS = sanitizeEpisodeTiming(
      controllerTelemetry.timeToFirstDamageS,
      survivalTimeS
    );
    controllerTelemetry.timeToFirstHitS = sanitizeEpisodeTiming(
      controllerTelemetry.timeToFirstHitS,
      survivalTimeS
    );
    controllerTelemetry.timeToFirstKillS = sanitizeEpisodeTiming(
      controllerTelemetry.timeToFirstKillS,
      survivalTimeS
    );
    sanitized.controllerTelemetry = controllerTelemetry;
  }

  return sanitized;
}

export function collectEpisodeTimingIssues(episodes = []) {
  const safeEpisodes = Array.isArray(episodes) ? episodes : [];
  const issues = [];

  for (const episode of safeEpisodes) {
    const survivalTimeS = Number(episode?.survivalTimeS ?? 0);
    for (const key of ["timeToFirstDamageS", "timeToFirstHitS", "timeToFirstKillS"]) {
      const raw = episode?.[key] ?? episode?.controllerTelemetry?.[key];
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) continue;
      if (numeric < 0 || (Number.isFinite(survivalTimeS) && numeric > survivalTimeS + 1e-6)) {
        issues.push({
          episodeIndex: episode?.episodeIndex ?? null,
          key,
          value: numeric,
          survivalTimeS
        });
      }
    }
  }

  return issues;
}

export function extractAggregateFromSummary(summary = {}) {
  if (summary?.finalChampion?.aggregate) {
    return summary.finalChampion.aggregate;
  }
  if (summary?.aggregate) {
    return summary.aggregate;
  }
  return null;
}

export function evaluateStarterBenchmark(summary = {}) {
  const aggregate = extractAggregateFromSummary(summary) ?? {};
  const acquisitionMet = summary?.acquisitionMet ?? aggregate?.acquisitionMet ?? false;
  const baselineMet = summary?.baselineMet ?? aggregate?.baselineMet ?? false;

  return {
    acquisitionMet: Boolean(acquisitionMet),
    baselineMet: Boolean(baselineMet),
    passed: Boolean(acquisitionMet) && Boolean(baselineMet),
    reason: !acquisitionMet
      ? "starter benchmark failed: no hit-positive evidence within the first 5 completed attempts"
      : !baselineMet
        ? "starter benchmark failed: no kill-positive evidence within the first 5 completed attempts"
        : null
  };
}

export async function validateLearningOutputs(outputDir) {
  const missing = [];

  for (const relativePath of REQUIRED_LEARNING_OUTPUT_FILES) {
    const absolutePath = path.join(outputDir, relativePath);
    if (!(await fileExists(absolutePath))) {
      missing.push(relativePath);
    }
  }

  const candidateSummariesDir = path.join(outputDir, "candidate-summaries");
  let candidateSummaryCount = 0;

  if (await fileExists(candidateSummariesDir)) {
    const entries = await readdir(candidateSummariesDir, { withFileTypes: true });
    candidateSummaryCount = entries.filter((entry) => (
      entry.isFile()
      && entry.name.endsWith(".json")
      && entry.name !== ".gitkeep"
    )).length;
  }

  if (candidateSummaryCount === 0) {
    missing.push("candidate-summaries/*.json");
  }

  return {
    ok: missing.length === 0,
    missing,
    candidateSummaryCount
  };
}

export async function readLearnSummary(outputDir) {
  return await readJsonIfExists(path.join(outputDir, "latest-session-summary.json"), null);
}
