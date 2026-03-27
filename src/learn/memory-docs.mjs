import path from "node:path";
import { readTextIfExists, writeText } from "../utils/fs.mjs";
import { LEARNING_PHASES, normalizeLearningPhase } from "./phases.mjs";

const MEMORY_MARKERS = Object.freeze({
  start: "<!-- MEMORY_GENERATED:BEGIN -->",
  end: "<!-- MEMORY_GENERATED:END -->"
});

const SELF_LEARNING_MARKERS = Object.freeze({
  start: "<!-- SELF_LEARNING_GENERATED:BEGIN -->",
  end: "<!-- SELF_LEARNING_GENERATED:END -->"
});

function formatList(items, fallback = "- None yet.") {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  return safeItems.length > 0
    ? safeItems.map((item) => `- ${item}`).join("\n")
    : fallback;
}

function buildGeneratedBlock(markers, generatedBody) {
  return `${markers.start}\n${generatedBody.trim()}\n${markers.end}`;
}

function insertGeneratedBlock(existing, block) {
  const normalized = existing.endsWith("\n") ? existing : `${existing}\n`;
  const firstDoubleNewline = normalized.indexOf("\n\n");

  if (firstDoubleNewline === -1) {
    return `${normalized}\n${block}\n`;
  }

  const prefix = normalized.slice(0, firstDoubleNewline + 2);
  const suffix = normalized.slice(firstDoubleNewline + 2).replace(/^\s*/, "");
  const next = `${prefix}${block}\n\n${suffix}`;
  return next.endsWith("\n") ? next : `${next}\n`;
}

function injectGeneratedBlock(existing, generatedBody, markers, fallbackPrefix, fallbackSuffix = "") {
  const block = buildGeneratedBlock(markers, generatedBody);

  if (
    typeof existing === "string"
    && existing.includes(markers.start)
    && existing.includes(markers.end)
  ) {
    const startIndex = existing.indexOf(markers.start);
    const endIndex = existing.indexOf(markers.end) + markers.end.length;
    const next = `${existing.slice(0, startIndex)}${block}${existing.slice(endIndex)}`;
    return next.endsWith("\n") ? next : `${next}\n`;
  }

  if (typeof existing === "string" && existing.trim().length > 0) {
    return insertGeneratedBlock(existing, block);
  }

  const assembled = `${fallbackPrefix}${block}${fallbackSuffix}`;
  return assembled.endsWith("\n") ? assembled : `${assembled}\n`;
}

function summarizeRejectionPatterns(rejections) {
  const counts = new Map();

  for (const rejection of Array.isArray(rejections) ? rejections : []) {
    const reason = typeof rejection?.reason === "string" ? rejection.reason : "unknown rejection";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([reason, count]) => `${reason} (${count})`);
}

function deriveActiveHypothesis(sessionSummary) {
  switch (normalizeLearningPhase(sessionSummary?.learningPhase ?? sessionSummary?.targetMode)) {
    case LEARNING_PHASES.STABILIZE_SCORE:
      return "Optimize kill-positive consistency and score conversion without widening the fairness surface.";
    case LEARNING_PHASES.BOOTSTRAP_KILL:
      return "Convert first-hit acquisition into a repeatable first-kill batch inside the 5-attempt baseline.";
    case LEARNING_PHASES.BOOTSTRAP_HIT:
    default:
      return "Bootstrap the first hit with pitch-band scanning, probe bursts, and damage-driven micro-scans.";
  }
}

export async function writeLearningMemoryDocs(projectRoot, payload) {
  const {
    championEntry,
    sessionSummary,
    runConfig,
    semanticMemory,
    experimentQueue = [],
    knownConstraints = []
  } = payload;

  const memoryPath = path.join(projectRoot, "MEMORY.md");
  const selfLearningPath = path.join(projectRoot, "SELF_LEARNING.md");

  const latestLesson = semanticMemory?.notes?.length
    ? semanticMemory.notes[semanticMemory.notes.length - 1]?.text
    : null;

  const championSummary = championEntry?.aggregate
    ? [
        `id: \`${championEntry.id}\``,
        `label: \`${championEntry.label}\``,
        `learning phase: \`${championEntry.aggregate.learningPhase}\``,
        `hit-positive episodes: \`${championEntry.aggregate.episodesWithHit}\``,
        `kill-positive episodes: \`${championEntry.aggregate.episodesWithKill}\``,
        `total hits: \`${championEntry.aggregate.totalShotsHit}\``,
        `total kills: \`${championEntry.aggregate.totalKills}\``,
        `best score: \`${championEntry.aggregate.bestScore}\``,
        `mean survival: \`${championEntry.aggregate.meanSurvivalTimeS}\``,
        `baseline milestone: \`${championEntry.aggregate.baselineMet ? "1 kill within 5 attempts met" : "still below 1 kill within 5 attempts"}\``
      ]
    : ["No champion has been recorded yet."];

  const runConfigSummary = runConfig
    ? [
        `agentName: \`${runConfig.agentName}\``,
        `modelProvider: \`${runConfig.modelProvider}\``,
        `modelName: \`${runConfig.modelName}\``,
        `headless: \`${runConfig.headless}\``,
        `attemptBudget: \`${runConfig.attemptBudget}\``,
        `timeBudgetMinutes: \`${runConfig.timeBudgetMinutes}\``,
        `learningEnabled: \`${runConfig.learningEnabled}\``
      ]
    : ["No run config has been written yet."];

  const memoryGenerated = [
    "## Current best policy summary",
    formatList(championSummary),
    "",
    "## Active hypothesis",
    `- ${deriveActiveHypothesis(sessionSummary)}`,
    "",
    "## Most recent useful lesson",
    latestLesson ? `- ${latestLesson}` : "- No lesson has been promoted yet.",
    "",
    "## Current run config",
    formatList(runConfigSummary),
    "",
    "## Current experiment queue",
    formatList(experimentQueue, "- No experiment queue has been generated yet."),
    "",
    "## Known constraints / known bugs",
    formatList([
      "Survival-only zero-contact behavior is not a valid promotion target before first hit or first kill.",
      "Durable learning requires both a persistent browser profile and a persistent workspace.",
      "Only the public runtime contract may be used.",
      ...knownConstraints
    ])
  ].join("\n");

  const existingMemory = await readTextIfExists(memoryPath, null);
  const memoryFallbackPrefix = "# MEMORY.md\n\nShort working memory for the current agent/session. This file is safe to overwrite often.\n\n";
  const memoryFallbackSuffix = "\n\n## Manual notes\n\n- Add temporary user steering or session notes here.\n- Keep this section short.\n";
  await writeText(
    memoryPath,
    injectGeneratedBlock(
      existingMemory,
      memoryGenerated,
      MEMORY_MARKERS,
      memoryFallbackPrefix,
      memoryFallbackSuffix
    )
  );

  const stableHeuristics = [
    ...(semanticMemory?.contactSignals ?? []).slice(-4).map((entry) => entry.summary),
    ...(semanticMemory?.notes ?? []).slice(-6).map((entry) => entry.text)
  ];
  const rejectionPatterns = summarizeRejectionPatterns(sessionSummary?.rejections ?? []);
  const improvedExperiments = (sessionSummary?.promotions ?? []).map((promotion) => promotion.reason);
  const selfLearningGenerated = [
    "## Stable heuristics that work",
    formatList(stableHeuristics),
    "",
    "## Recurring failure patterns",
    formatList(rejectionPatterns),
    "",
    "## Experiments that failed",
    formatList(rejectionPatterns),
    "",
    "## Experiments that improved performance",
    formatList(improvedExperiments)
  ].join("\n");

  const existingSelfLearning = await readTextIfExists(selfLearningPath, null);
  const selfLearningFallbackPrefix = "# SELF_LEARNING.md\n\nCurated durable lessons across runs. Keep this focused on heuristics that survived real batch comparison.\n\n";
  const selfLearningFallbackSuffix = "\n\n## Promotion rules\n\n- Promote only on batch evidence.\n- In `bootstrap_hit`, prefer real hits over survival-only zero-contact behavior.\n- In `bootstrap_kill`, prefer real kills over hit-only survival gains.\n- In `stabilize_score`, use the kill -> score -> hit quality -> survival ladder.\n\n## Stagnation protocol\n\n- If repeated batches fail to promote, widen mutation scale modestly.\n- Re-screen the bootstrap catalog before widening mutation too far.\n- Try a hall-of-fame parent before changing controller family.\n- Escalate from config edits to policy-code edits only after bounded config search stalls.\n\n## Escalation rule\n\n- Config and memory first.\n- `src/policies/**` second.\n- Runtime wrappers and contract files only with explicit human review.\n";
  await writeText(
    selfLearningPath,
    injectGeneratedBlock(
      existingSelfLearning,
      selfLearningGenerated,
      SELF_LEARNING_MARKERS,
      selfLearningFallbackPrefix,
      selfLearningFallbackSuffix
    )
  );
}
