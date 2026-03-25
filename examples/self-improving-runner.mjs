import {
  PUBLIC_AGENT_CONTRACT,
  PUBLIC_AGENT_WORKFLOW_CONTRACT,
  aggregateEpisodes,
  attachConsoleRecorder,
  candidateSummaryPath,
  compareBatchMetrics,
  createAdaptiveSweeperController,
  createCandidatePolicyRecord,
  createSeededRng,
  defaultPolicy,
  deriveNextCandidateId,
  deriveSemanticNotes,
  determineTargetMode,
  ensureLearningLayout,
  fileExists,
  gotoAgentRuntime,
  launchPersistentBrowser,
  loadDefaultPolicy,
  loadLearningState,
  persistResolvedConfig,
  readCandidateSummaryIds,
  recordEpisode,
  resolveLearningRunConfig,
  runPolicyEpisodes,
  mutatePolicy,
  selectParentFromHallOfFame,
  suggestNextExperiments,
  upsertHallOfFame,
  writeCandidateSummary,
  writeChampion,
  writeHallOfFame,
  writeLatestSessionSummary,
  writeLearningMemoryDocs,
  writeScoreboard,
  writeSemanticMemory
} from "../src/index.mjs";

const config = await resolveLearningRunConfig();
const layout = await ensureLearningLayout(config.outputDir);
await persistResolvedConfig(config.outputDir, config);

const persistedState = await loadLearningState(layout);
const seedPolicy = await loadDefaultPolicy().catch(() => defaultPolicy());
const rng = createSeededRng(config.rngSeed);

const { context, page } = await launchPersistentBrowser({
  headless: config.headless,
  userDataDir: config.userDataDir
});

const consoleRecorder = attachConsoleRecorder(page);

let championEntry = persistedState.champion ?? createCandidatePolicyRecord({
  id: 0,
  label: "seed",
  policy: seedPolicy
});
let hallOfFame = Array.isArray(persistedState.hallOfFame) ? persistedState.hallOfFame : [];
let semanticMemory = persistedState.semanticMemory ?? { version: 1, notes: [] };
let nextPolicyId = await deriveNextCandidateId(layout, {
  champion: championEntry,
  hallOfFame
});

const session = {
  workflowContract: PUBLIC_AGENT_WORKFLOW_CONTRACT,
  runtimeContract: PUBLIC_AGENT_CONTRACT,
  startedAt: new Date().toISOString(),
  baseUrl: config.baseUrl,
  agentName: config.agentName,
  modelProvider: config.modelProvider,
  modelName: config.modelName,
  headless: config.headless,
  watchMode: config.watchMode,
  learningEnabled: config.learningEnabled,
  attemptBudget: config.attemptBudget,
  timeBudgetMinutes: config.timeBudgetMinutes,
  userNotes: config.userNotes,
  stepMs: config.stepMs,
  baselineDeaths: config.baselineDeaths,
  candidateDeaths: config.candidateDeaths,
  maxCandidates: config.maxCandidates,
  stagnationLimit: config.stagnationLimit,
  rngSeed: config.rngSeed,
  outputDir: config.outputDir,
  userDataDir: config.userDataDir,
  promotions: [],
  rejections: [],
  warnings: [],
  stopReason: null,
  acquisitionMet: false,
  baselineMet: false,
  acquisitionTarget: "at least 1 hit within 5 completed attempts",
  firstKillTarget: "at least 1 kill within 5 completed attempts",
  targetMode: "hit-bootstrap"
};

function pushUniqueSemanticNotes(notes, candidateId) {
  for (const note of Array.isArray(notes) ? notes : []) {
    if (semanticMemory.notes.some((entry) => entry.text === note)) continue;
    semanticMemory.notes.push({
      createdAt: new Date().toISOString(),
      candidateId,
      text: note
    });
  }
}

function recordWarning(kind, error) {
  const message = error instanceof Error ? error.message : String(error);
  const warning = {
    recordedAt: new Date().toISOString(),
    kind,
    message
  };
  session.warnings.push(warning);
  console.error(`[warning:${kind}] ${message}`);
}

async function safeSupportiveWrite(kind, writeFn) {
  try {
    await writeFn();
  } catch (error) {
    recordWarning(kind, error);
  }
}

function buildCandidateSummary(policyEntry, championAtEvaluationStart, decision, evaluationKind, targetMode) {
  return {
    generatedAt: new Date().toISOString(),
    evaluationKind,
    targetMode,
    acquisitionMet: Boolean(policyEntry.aggregate?.acquisitionMet),
    baselineMet: Boolean(policyEntry.aggregate?.baselineMet),
    candidate: {
      id: policyEntry.id,
      label: policyEntry.label,
      parentId: policyEntry.parentId,
      policy: policyEntry.policy,
      aggregate: policyEntry.aggregate
    },
    championAtEvaluationStart: championAtEvaluationStart
      ? {
          id: championAtEvaluationStart.id,
          label: championAtEvaluationStart.label,
          aggregate: championAtEvaluationStart.aggregate
        }
      : null,
    decision
  };
}

async function ensureChampionSummaryRecorded(policyEntry, evaluationKind = "champion-snapshot") {
  if (!policyEntry?.aggregate) return;

  const summaryPath = candidateSummaryPath(layout, policyEntry.id);
  if (await fileExists(summaryPath)) {
    return summaryPath;
  }

  const targetMode = determineTargetMode(policyEntry.aggregate);
  return await writeCandidateSummary(
    layout,
    policyEntry.id,
    buildCandidateSummary(
      policyEntry,
      null,
      {
        promote: true,
        phase: targetMode,
        reason: `recorded ${evaluationKind} for the current champion`,
        key: evaluationKind,
        delta: 0
      },
      evaluationKind,
      targetMode
    )
  );
}

function buildScoreboardPayload(sessionAttemptCount, candidateEvaluations, stagnationCount) {
  return {
    generatedAt: new Date().toISOString(),
    stopReason: session.stopReason,
    sessionAttemptCount,
    candidateEvaluations,
    stagnationCount,
    targetMode: session.targetMode,
    acquisitionMet: session.acquisitionMet,
    baselineMet: session.baselineMet,
    champion: session.finalChampion ?? (
      championEntry
        ? {
            id: championEntry.id,
            label: championEntry.label,
            aggregate: championEntry.aggregate
          }
        : null
    )
  };
}

async function evaluatePolicy(policyEntry, targetEpisodes) {
  const controller = createAdaptiveSweeperController(policyEntry.policy);

  const evaluation = await runPolicyEpisodes({
    page,
    controller,
    policyEntry,
    targetEpisodes,
    stepMs: config.stepMs,
    maxStepsPerEpisode: config.maxStepsPerEpisode,
    onEpisodeRecorded: async (episodeRecord) => {
      await recordEpisode(layout, episodeRecord);
    }
  });

  return {
    episodes: evaluation.episodes,
    aggregate: aggregateEpisodes(evaluation.episodes)
  };
}

const startedMs = Date.now();
let sessionAttemptCount = 0;
let candidateEvaluations = 0;
let stagnationCount = 0;
let fatalError = null;

try {
  await gotoAgentRuntime(page, {
    baseUrl: config.baseUrl,
    agentName: config.agentName
  });

  if (!championEntry.aggregate) {
    const seededEvaluation = await evaluatePolicy(championEntry, config.baselineDeaths);
    championEntry = {
      ...championEntry,
      aggregate: seededEvaluation.aggregate,
      episodes: seededEvaluation.episodes,
      promotedAt: new Date().toISOString()
    };
    hallOfFame = upsertHallOfFame(hallOfFame, championEntry);
    sessionAttemptCount += config.baselineDeaths;

    await writeChampion(layout, championEntry);
    await safeSupportiveWrite("hall-of-fame", async () => {
      await writeHallOfFame(layout, hallOfFame);
    });
    await ensureChampionSummaryRecorded(championEntry, "seed-baseline");
  } else {
    hallOfFame = upsertHallOfFame(hallOfFame, championEntry);
    await ensureChampionSummaryRecorded(championEntry, "loaded-champion");
  }

  session.initialChampion = {
    id: championEntry.id,
    label: championEntry.label,
    aggregate: championEntry.aggregate
  };
  session.acquisitionMet = Boolean(championEntry.aggregate?.acquisitionMet);
  session.baselineMet = Boolean(championEntry.aggregate?.baselineMet);
  session.targetMode = determineTargetMode(championEntry.aggregate);

  if (consoleRecorder.counts().errorCount > 0) {
    throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
  }

  while (candidateEvaluations < config.maxCandidates) {
    const elapsedMinutes = (Date.now() - startedMs) / 60_000;

    if (!config.learningEnabled) {
      session.stopReason = "learning-disabled";
      break;
    }

    if (config.timeBudgetMinutes > 0 && elapsedMinutes >= config.timeBudgetMinutes) {
      session.stopReason = "time-budget";
      break;
    }

    if (stagnationCount >= config.stagnationLimit) {
      session.stopReason = "stagnation-limit";
      break;
    }

    if (sessionAttemptCount + config.candidateDeaths > config.attemptBudget) {
      session.stopReason = "attempt-budget";
      break;
    }

    candidateEvaluations += 1;

    const targetMode = determineTargetMode(championEntry.aggregate);
    const explorationScale = 1 + (stagnationCount / Math.max(1, config.stagnationLimit));
    const parentEntry = selectParentFromHallOfFame(hallOfFame, rng) ?? championEntry;
    const candidateId = nextPolicyId;
    const candidateEntry = createCandidatePolicyRecord({
      id: candidateId,
      label: `candidate-${candidateId}`,
      parentId: parentEntry.id,
      policy: mutatePolicy(parentEntry.policy, {
        rng,
        targetMode,
        explorationScale
      })
    });
    nextPolicyId += 1;

    const evaluation = await evaluatePolicy(candidateEntry, config.candidateDeaths);
    sessionAttemptCount += config.candidateDeaths;

    candidateEntry.aggregate = evaluation.aggregate;
    candidateEntry.episodes = evaluation.episodes;

    const comparison = compareBatchMetrics(candidateEntry.aggregate, championEntry.aggregate, {
      targetMode,
      minScoreDelta: config.minScoreDelta
    });

    await writeCandidateSummary(
      layout,
      candidateEntry.id,
      buildCandidateSummary(
        candidateEntry,
        championEntry,
        comparison,
        "candidate-batch",
        targetMode
      )
    );

    if (comparison.promote) {
      const semanticNotes = deriveSemanticNotes(
        championEntry.policy,
        candidateEntry.policy,
        championEntry.aggregate,
        candidateEntry.aggregate
      );

      championEntry = {
        ...candidateEntry,
        promotedAt: new Date().toISOString()
      };
      hallOfFame = upsertHallOfFame(hallOfFame, championEntry);
      pushUniqueSemanticNotes(semanticNotes, candidateEntry.id);

      await writeChampion(layout, championEntry);
      await safeSupportiveWrite("hall-of-fame", async () => {
        await writeHallOfFame(layout, hallOfFame);
      });
      await safeSupportiveWrite("semantic-memory", async () => {
        await writeSemanticMemory(layout, semanticMemory);
      });

      session.promotions.push({
        candidateId: candidateEntry.id,
        phase: comparison.phase,
        reason: comparison.reason,
        aggregate: candidateEntry.aggregate
      });

      stagnationCount = 0;
    } else {
      session.rejections.push({
        candidateId: candidateEntry.id,
        phase: comparison.phase,
        reason: comparison.reason,
        aggregate: candidateEntry.aggregate
      });
      stagnationCount += 1;
    }

    session.acquisitionMet = Boolean(championEntry.aggregate?.acquisitionMet);
    session.baselineMet = Boolean(championEntry.aggregate?.baselineMet);
    session.targetMode = determineTargetMode(championEntry.aggregate);

    await safeSupportiveWrite("scoreboard", async () => {
      await writeScoreboard(layout, buildScoreboardPayload(sessionAttemptCount, candidateEvaluations, stagnationCount));
    });

    if (consoleRecorder.counts().errorCount > 0) {
      throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
    }
  }

  if (!session.stopReason) {
    session.stopReason = "max-candidates";
  }
} catch (error) {
  fatalError = error;
  session.stopReason = session.stopReason ?? "error";
  session.failed = true;
  session.failure = error instanceof Error ? error.message : String(error);
} finally {
  session.finishedAt = new Date().toISOString();
  session.sessionAttemptCount = sessionAttemptCount;
  session.candidateEvaluations = candidateEvaluations;
  session.stagnationCount = stagnationCount;
  session.acquisitionMet = Boolean(championEntry?.aggregate?.acquisitionMet);
  session.baselineMet = Boolean(championEntry?.aggregate?.baselineMet);
  session.targetMode = determineTargetMode(championEntry?.aggregate ?? {});
  session.finalChampion = championEntry
    ? {
        id: championEntry.id,
        label: championEntry.label,
        policy: championEntry.policy,
        aggregate: championEntry.aggregate
      }
    : null;
  session.keyLessonsLearned = (semanticMemory.notes ?? []).slice(-6).map((entry) => entry.text);
  session.nextRecommendedExperiments = suggestNextExperiments(championEntry, stagnationCount);
  session.console = consoleRecorder.counts();

  const requiredErrors = [];
  const collectRequiredError = (label, error) => {
    const message = error instanceof Error ? error.message : String(error);
    requiredErrors.push(new Error(`${label}: ${message}`));
  };

  if (championEntry?.aggregate) {
    try {
      await ensureChampionSummaryRecorded(championEntry, "final-champion");
    } catch (error) {
      collectRequiredError("candidate-summaries", error);
    }
  }

  await safeSupportiveWrite("scoreboard", async () => {
    await writeScoreboard(layout, buildScoreboardPayload(sessionAttemptCount, candidateEvaluations, stagnationCount));
  });
  await safeSupportiveWrite("semantic-memory", async () => {
    await writeSemanticMemory(layout, semanticMemory);
  });
  await safeSupportiveWrite("hall-of-fame", async () => {
    await writeHallOfFame(layout, hallOfFame);
  });

  if (config.saveMemoryDocs) {
    await safeSupportiveWrite("memory-docs", async () => {
      await writeLearningMemoryDocs(process.cwd(), {
        championEntry,
        sessionSummary: session,
        runConfig: config,
        semanticMemory,
        experimentQueue: session.nextRecommendedExperiments,
        knownConstraints: [
          "Runtime wrappers and fairness-boundary files stay locked by default."
        ]
      });
    });
  }

  if (championEntry) {
    try {
      await writeChampion(layout, championEntry);
    } catch (error) {
      collectRequiredError("champion-policy.json", error);
    }
  } else {
    collectRequiredError("champion-policy.json", new Error("Missing final champion entry."));
  }

  if (!(await fileExists(layout.episodesPath))) {
    collectRequiredError("episodes.jsonl", new Error("Missing required output file."));
  }

  try {
    const candidateSummaryIds = await readCandidateSummaryIds(layout);
    if (candidateSummaryIds.length === 0) {
      throw new Error("No candidate summaries were written.");
    }
  } catch (error) {
    collectRequiredError("candidate-summaries", error);
  }

  if (requiredErrors.length > 0) {
    session.failed = true;
    session.persistenceFailures = requiredErrors.map((error) => error.message);
  }

  try {
    await writeLatestSessionSummary(layout, session);
  } catch (error) {
    collectRequiredError("latest-session-summary.json", error);
  }

  try {
    await context.close();
  } catch (error) {
    if (!fatalError) {
      fatalError = error;
      session.failed = true;
      session.failure = error instanceof Error ? error.message : String(error);
    }
  }

  if (!fatalError && requiredErrors.length > 0) {
    fatalError = new AggregateError(requiredErrors, "Required learning output persistence failed.");
  }
}

if (fatalError) {
  throw fatalError;
}

console.log(JSON.stringify({
  stopReason: session.stopReason,
  acquisitionMet: session.acquisitionMet,
  baselineMet: session.baselineMet,
  targetMode: session.targetMode,
  championId: session.finalChampion?.id ?? null,
  championLabel: session.finalChampion?.label ?? null,
  aggregate: session.finalChampion?.aggregate ?? null,
  warnings: session.warnings,
  outputDir: config.outputDir,
  userDataDir: config.userDataDir
}, null, 2));
