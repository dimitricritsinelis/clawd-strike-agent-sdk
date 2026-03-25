import path from "node:path";
import { readTextIfExists, writeText } from "../utils/fs.mjs";

const GENERATED_START = "<!-- GENERATED:START -->";
const GENERATED_END = "<!-- GENERATED:END -->";

function formatList(items, fallback = "- None yet.") {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  return safeItems.length > 0
    ? safeItems.map((item) => `- ${item}`).join("\n")
    : fallback;
}

function injectGeneratedBlock(existing, generatedBody, fallbackPrefix, fallbackSuffix = "") {
  const block = `${GENERATED_START}\n${generatedBody.trim()}\n${GENERATED_END}`;

  if (
    typeof existing === "string"
    && existing.includes(GENERATED_START)
    && existing.includes(GENERATED_END)
  ) {
    const startIndex = existing.indexOf(GENERATED_START);
    const endIndex = existing.indexOf(GENERATED_END) + GENERATED_END.length;
    const next = `${existing.slice(0, startIndex)}${block}${existing.slice(endIndex)}`;
    return next.endsWith("\n") ? next : `${next}\n`;
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
        `kill-positive episodes: \`${championEntry.aggregate.episodesWithKill}\``,
        `total kills: \`${championEntry.aggregate.totalKills}\``,
        `best score: \`${championEntry.aggregate.bestScore}\``,
        `median score: \`${championEntry.aggregate.medianScore}\``,
        `mean survival: \`${championEntry.aggregate.meanSurvivalTimeS}\``
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

  const activeHypothesis = sessionSummary?.baselineMet
    ? "Optimize score consistency without widening the fairness surface."
    : "Bootstrap the first kill through bounded movement, sweep, and panic-turn tuning.";

  const memoryGenerated = [
    "## Current best policy summary",
    formatList(championSummary),
    "",
    "## Active hypothesis",
    `- ${activeHypothesis}`,
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
    injectGeneratedBlock(existingMemory, memoryGenerated, memoryFallbackPrefix, memoryFallbackSuffix)
  );

  const stableHeuristics = (semanticMemory?.notes ?? []).slice(-8).map((entry) => entry.text);
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
  const selfLearningFallbackSuffix = "\n\n## Promotion rules\n\n- Promote only on batch evidence.\n- Prefer:\n  1. more kill-positive episodes\n  2. more total kills\n  3. higher best score\n  4. higher median score\n  5. higher mean survival\n  6. higher accuracy with comparable shot volume\n\n## Stagnation protocol\n\n- If repeated batches fail to promote, widen mutation scale modestly.\n- Try a hall-of-fame parent before changing controller family.\n- Escalate from config edits to policy-code edits only after bounded config search stalls.\n\n## Escalation rule\n\n- Config and memory first.\n- `src/policies/**` second.\n- Runtime wrappers and contract files only with explicit human review.\n";
  await writeText(
    selfLearningPath,
    injectGeneratedBlock(
      existingSelfLearning,
      selfLearningGenerated,
      selfLearningFallbackPrefix,
      selfLearningFallbackSuffix
    )
  );
}
