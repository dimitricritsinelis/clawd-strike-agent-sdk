import {
  PUBLIC_AGENT_CONTRACT,
  PUBLIC_AGENT_WORKFLOW_CONTRACT,
  aggregateEpisodes,
  attachConsoleRecorder,
  createAdaptiveSweeperController,
  createCandidatePolicyRecord,
  createSeededRng,
  defaultPolicy,
  deriveSemanticNotes,
  gotoAgentRuntime,
  launchPersistentBrowser,
  loadDefaultPolicy,
  loadLearningState,
  persistResolvedConfig,
  resolveLearningRunConfig,
  runPolicyEpisodes,
  ensureLearningLayout,
  recordEpisode,
  writeCandidateSummary,
  writeChampion,
  writeHallOfFame,
  writeLatestSessionSummary,
  writeScoreboard,
  writeSemanticMemory,
  mutatePolicy,
  compareBatchMetrics,
  selectParentFromHallOfFame,
  suggestNextExperiments,
  upsertHallOfFame,
  writeLearningMemoryDocs
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
let nextPolicyId = Math.max(
  Number(championEntry.id ?? 0),
  ...hallOfFame.map((entry) => Number(entry?.id ?? 0))
) + 1;

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
  stopReason: null,
  baselineMet: false,
  minimumTarget: "at least 1 kill within 5 completed attempts"
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
    await writeHallOfFame(layout, hallOfFame);
  } else {
    hallOfFame = upsertHallOfFame(hallOfFame, championEntry);
  }

  session.initialChampion = {
    id: championEntry.id,
    label: championEntry.label,
    aggregate: championEntry.aggregate
  };
  session.baselineMet = Boolean(championEntry.aggregate?.baselineMet);

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

    const targetMode = championEntry.aggregate?.episodesWithKill > 0
      ? "score-optimization"
      : "kill-bootstrap";
    const explorationScale = 1 + (stagnationCount / Math.max(1, config.stagnationLimit));

    const parentEntry = selectParentFromHallOfFame(hallOfFame, rng) ?? championEntry;
    const candidateEntry = createCandidatePolicyRecord({
      id: nextPolicyId,
      label: `candidate-${candidateEvaluations}`,
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
      minScoreDelta: config.minScoreDelta
    });

    const candidateSummary = {
      generatedAt: new Date().toISOString(),
      candidate: {
        id: candidateEntry.id,
        label: candidateEntry.label,
        parentId: candidateEntry.parentId,
        policy: candidateEntry.policy,
        aggregate: candidateEntry.aggregate
      },
      championAtEvaluationStart: {
        id: championEntry.id,
        label: championEntry.label,
        aggregate: championEntry.aggregate
      },
      decision: comparison
    };

    await writeCandidateSummary(layout, candidateEntry.id, candidateSummary);

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
      await writeHallOfFame(layout, hallOfFame);
      await writeSemanticMemory(layout, semanticMemory);

      session.promotions.push({
        candidateId: candidateEntry.id,
        reason: comparison.reason,
        aggregate: candidateEntry.aggregate
      });

      stagnationCount = 0;
    } else {
      session.rejections.push({
        candidateId: candidateEntry.id,
        reason: comparison.reason,
        aggregate: candidateEntry.aggregate
      });
      stagnationCount += 1;
    }

    session.baselineMet = Boolean(championEntry.aggregate?.baselineMet);

    await writeScoreboard(layout, {
      generatedAt: new Date().toISOString(),
      stopReason: session.stopReason,
      sessionAttemptCount,
      candidateEvaluations,
      stagnationCount,
      champion: {
        id: championEntry.id,
        label: championEntry.label,
        aggregate: championEntry.aggregate
      }
    });

    if (consoleRecorder.counts().errorCount > 0) {
      throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
    }
  }

  if (!session.stopReason) {
    session.stopReason = "max-candidates";
  }
} catch (error) {
  session.stopReason = session.stopReason ?? "error";
  session.failed = true;
  session.failure = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  session.finishedAt = new Date().toISOString();
  session.sessionAttemptCount = sessionAttemptCount;
  session.candidateEvaluations = candidateEvaluations;
  session.stagnationCount = stagnationCount;
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

  await writeLatestSessionSummary(layout, session).catch(() => {});
  await writeScoreboard(layout, {
    generatedAt: new Date().toISOString(),
    stopReason: session.stopReason,
    sessionAttemptCount,
    candidateEvaluations,
    stagnationCount,
    champion: session.finalChampion
  }).catch(() => {});
  await writeSemanticMemory(layout, semanticMemory).catch(() => {});
  await writeHallOfFame(layout, hallOfFame).catch(() => {});

  if (config.saveMemoryDocs) {
    await writeLearningMemoryDocs(process.cwd(), {
      championEntry,
      sessionSummary: session,
      runConfig: config,
      semanticMemory,
      experimentQueue: session.nextRecommendedExperiments,
      knownConstraints: [
        "Runtime wrappers and fairness-boundary files stay locked by default."
      ]
    }).catch(() => {});
  }

  await context.close();
}

console.log(JSON.stringify({
  stopReason: session.stopReason,
  baselineMet: session.baselineMet,
  championId: session.finalChampion?.id ?? null,
  championLabel: session.finalChampion?.label ?? null,
  aggregate: session.finalChampion?.aggregate ?? null,
  outputDir: config.outputDir,
  userDataDir: config.userDataDir
}, null, 2));
