import {
  PUBLIC_AGENT_CONTRACT,
  PUBLIC_AGENT_WORKFLOW_CONTRACT,
  LEARNING_PHASES,
  aggregateEpisodes,
  attachConsoleRecorder,
  candidateSummaryPath,
  compareBatchMetrics,
  createAdaptiveSweeperController,
  createBootstrapCatalog,
  createCandidateIdAllocator,
  createCandidatePolicyRecord,
  createLearningSessionId,
  createSeededRng,
  defaultPolicy,
  deriveLearningPhase,
  deriveSemanticNotes,
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

const sessionId = createLearningSessionId("learn");
const persistedState = await loadLearningState(layout);
const seedPolicy = await loadDefaultPolicy().catch(() => defaultPolicy());
const rng = createSeededRng(config.rngSeed);
const allocateCandidateId = await createCandidateIdAllocator(layout, { sessionId });

const { context, page } = await launchPersistentBrowser({
  headless: config.headless,
  userDataDir: config.userDataDir
});

const consoleRecorder = attachConsoleRecorder(page);

let championEntry = persistedState.champion ?? createCandidatePolicyRecord({
  id: `${sessionId}-seed`,
  label: "seed",
  policy: seedPolicy,
  learningPhase: LEARNING_PHASES.BOOTSTRAP_HIT,
  metadata: {
    origin: "seed"
  }
});
let hallOfFame = Array.isArray(persistedState.hallOfFame) ? persistedState.hallOfFame : [];
let semanticMemory = persistedState.semanticMemory ?? { version: 2, notes: [], contactSignals: [] };

const session = {
  sessionId,
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
  candidateScreenDeaths: config.candidateScreenDeaths,
  candidateDeaths: config.candidateDeaths,
  bootstrapCatalogSize: config.bootstrapCatalogSize,
  bootstrapConfirmCount: config.bootstrapConfirmCount,
  bootstrapRescreenThreshold: config.bootstrapRescreenThreshold,
  maxCandidates: config.maxCandidates,
  stagnationLimit: config.stagnationLimit,
  rngSeed: config.rngSeed,
  outputDir: config.outputDir,
  userDataDir: config.userDataDir,
  candidateIdStrategy: "session-id plus counter with exclusive summary writes",
  promotions: [],
  rejections: [],
  warnings: [],
  stopReason: null,
  acquisitionMet: false,
  baselineMet: false,
  acquisitionTarget: "at least 1 hit within 5 completed attempts",
  firstKillTarget: "at least 1 kill within 5 completed attempts",
  baselineMilestone: "baselineMet means at least 1 kill within 5 completed attempts",
  learningPhase: LEARNING_PHASES.BOOTSTRAP_HIT,
  targetMode: LEARNING_PHASES.BOOTSTRAP_HIT,
  phaseHistory: [],
  bootstrapCatalogRounds: []
};

function pushUniqueSemanticNotes(notes, candidateEntry) {
  for (const note of Array.isArray(notes) ? notes : []) {
    if (semanticMemory.notes.some((entry) => entry.text === note)) continue;
    semanticMemory.notes.push({
      createdAt: new Date().toISOString(),
      candidateId: candidateEntry.id,
      learningPhase: candidateEntry.learningPhase,
      text: note
    });
  }
}

function recordContactSignal(candidateEntry) {
  const aggregate = candidateEntry?.aggregate ?? {};
  if (!aggregate.hitPositive && !aggregate.killPositive) {
    return;
  }

  if (!Array.isArray(semanticMemory.contactSignals)) {
    semanticMemory.contactSignals = [];
  }

  const key = [
    candidateEntry.metadata?.origin ?? "mutation",
    candidateEntry.metadata?.archetype ?? "mutated",
    candidateEntry.learningPhase,
    candidateEntry.policy.pitchSweepAmplitudeDeg,
    candidateEntry.policy.microScanTicks,
    candidateEntry.policy.fireBurstLengthTicks,
    candidateEntry.policy.engageBurstLengthTicks
  ].join("|");

  if (semanticMemory.contactSignals.some((entry) => entry.key === key)) {
    return;
  }

  semanticMemory.contactSignals.push({
    key,
    recordedAt: new Date().toISOString(),
    candidateId: candidateEntry.id,
    learningPhase: candidateEntry.learningPhase,
    archetype: candidateEntry.metadata?.archetype ?? "mutated",
    hitPositive: aggregate.hitPositive,
    killPositive: aggregate.killPositive,
    summary: [
      `${candidateEntry.metadata?.archetype ?? candidateEntry.label} produced ${aggregate.hitPositive ? "contact" : "no contact"}`,
      aggregate.killPositive ? "and a kill-positive episode" : "without a kill yet",
      `with pitch sweep ${candidateEntry.policy.pitchSweepAmplitudeDeg.toFixed(2)} / micro-scan ${candidateEntry.policy.microScanTicks}`,
      `and bursts ${candidateEntry.policy.fireBurstLengthTicks}:${candidateEntry.policy.fireBurstCooldownTicks} -> ${candidateEntry.policy.engageBurstLengthTicks}:${candidateEntry.policy.engageBurstCooldownTicks}.`
    ].join(" "),
    pitchProfile: {
      pitchSweepAmplitudeDeg: candidateEntry.policy.pitchSweepAmplitudeDeg,
      pitchSweepPeriodTicks: candidateEntry.policy.pitchSweepPeriodTicks,
      microScanPitchDeg: candidateEntry.policy.microScanPitchDeg
    },
    damageProfile: {
      microScanTicks: candidateEntry.policy.microScanTicks,
      damageScanMultiplier: candidateEntry.policy.damageScanMultiplier,
      damageForwardScale: candidateEntry.policy.damageForwardScale,
      damageStrafeScale: candidateEntry.policy.damageStrafeScale
    },
    fireProfile: {
      probeBurstLengthTicks: candidateEntry.policy.fireBurstLengthTicks,
      probeBurstCooldownTicks: candidateEntry.policy.fireBurstCooldownTicks,
      engageBurstLengthTicks: candidateEntry.policy.engageBurstLengthTicks,
      engageBurstCooldownTicks: candidateEntry.policy.engageBurstCooldownTicks
    }
  });

  semanticMemory.contactSignals = semanticMemory.contactSignals.slice(-24);
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

function notePhaseChange(source) {
  const aggregate = championEntry?.aggregate ?? {};
  const learningPhase = deriveLearningPhase(aggregate);
  session.learningPhase = learningPhase;
  session.targetMode = learningPhase;
  session.acquisitionMet = Boolean(aggregate.acquisitionMet);
  session.baselineMet = Boolean(aggregate.baselineMet);

  const previous = session.phaseHistory.at(-1);
  if (!previous || previous.learningPhase !== learningPhase || previous.championId !== championEntry?.id) {
    session.phaseHistory.push({
      recordedAt: new Date().toISOString(),
      source,
      championId: championEntry?.id ?? null,
      learningPhase,
      acquisitionMet: session.acquisitionMet,
      baselineMet: session.baselineMet
    });
  }
}

function buildCandidateSummary(
  policyEntry,
  championAtEvaluationStart,
  decision,
  evaluationKind,
  learningPhase,
  extra = {}
) {
  return {
    generatedAt: new Date().toISOString(),
    evaluationKind,
    learningPhase,
    targetMode: learningPhase,
    acquisitionMet: Boolean(policyEntry.aggregate?.acquisitionMet),
    baselineMet: Boolean(policyEntry.aggregate?.baselineMet),
    candidate: {
      id: policyEntry.id,
      label: policyEntry.label,
      parentId: policyEntry.parentId,
      learningPhase: policyEntry.learningPhase,
      metadata: policyEntry.metadata ?? {},
      policy: policyEntry.policy,
      aggregate: policyEntry.aggregate
    },
    championAtEvaluationStart: championAtEvaluationStart
      ? {
          id: championAtEvaluationStart.id,
          label: championAtEvaluationStart.label,
          learningPhase: championAtEvaluationStart.learningPhase,
          aggregate: championAtEvaluationStart.aggregate
        }
      : null,
    decision,
    ...extra
  };
}

async function ensureChampionSummaryRecorded(policyEntry, evaluationKind = "champion-snapshot") {
  if (!policyEntry?.aggregate) return;

  const summaryPath = candidateSummaryPath(layout, policyEntry.id);
  if (await fileExists(summaryPath)) {
    return summaryPath;
  }

  const learningPhase = deriveLearningPhase(policyEntry.aggregate);
  return await writeCandidateSummary(
    layout,
    policyEntry.id,
    buildCandidateSummary(
      policyEntry,
      null,
      {
        promote: true,
        phase: learningPhase,
        learningPhase,
        reason: `recorded ${evaluationKind} for the current champion`,
        key: evaluationKind,
        delta: 0
      },
      evaluationKind,
      learningPhase
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
    learningPhase: session.learningPhase,
    targetMode: session.targetMode,
    acquisitionMet: session.acquisitionMet,
    baselineMet: session.baselineMet,
    champion: session.finalChampion ?? (
      championEntry
        ? {
            id: championEntry.id,
            label: championEntry.label,
            learningPhase: championEntry.learningPhase,
            aggregate: championEntry.aggregate
          }
        : null
    )
  };
}

async function evaluatePolicy(policyEntry, targetEpisodes) {
  const controller = createAdaptiveSweeperController(policyEntry.policy, {
    learningPhase: policyEntry.learningPhase,
    stepMs: config.stepMs
  });

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

function sortEntriesForPhase(entries, learningPhase) {
  return [...entries].sort((left, right) => {
    const leftVsRight = compareBatchMetrics(left.aggregate ?? {}, right.aggregate ?? {}, { learningPhase });
    if (leftVsRight.promote) return -1;

    const rightVsLeft = compareBatchMetrics(right.aggregate ?? {}, left.aggregate ?? {}, { learningPhase });
    if (rightVsLeft.promote) return 1;

    const leftScore = Number(left.aggregate?.totalShotsHit ?? 0) + (Number(left.aggregate?.totalKills ?? 0) * 10);
    const rightScore = Number(right.aggregate?.totalShotsHit ?? 0) + (Number(right.aggregate?.totalKills ?? 0) * 10);
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

function remainingAttempts(sessionAttemptCount) {
  return Math.max(0, config.attemptBudget - sessionAttemptCount);
}

function canSpendEpisodes(sessionAttemptCount, deaths) {
  return sessionAttemptCount + deaths <= config.attemptBudget;
}

function chooseMutationParent(activeBootstrapParent) {
  if (
    activeBootstrapParent
    && session.learningPhase !== LEARNING_PHASES.STABILIZE_SCORE
    && activeBootstrapParent.aggregate
  ) {
    return activeBootstrapParent;
  }

  return selectParentFromHallOfFame(hallOfFame, rng) ?? championEntry;
}

async function persistChampionState() {
  await writeChampion(layout, championEntry);
  await safeSupportiveWrite("hall-of-fame", async () => {
    await writeHallOfFame(layout, hallOfFame);
  });
  await safeSupportiveWrite("semantic-memory", async () => {
    await writeSemanticMemory(layout, semanticMemory);
  });
}

async function promoteCandidate(candidateEntry, comparison, evaluationKind) {
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
  pushUniqueSemanticNotes(semanticNotes, candidateEntry);
  recordContactSignal(candidateEntry);

  await persistChampionState();

  session.promotions.push({
    candidateId: candidateEntry.id,
    evaluationKind,
    learningPhase: comparison.phase,
    reason: comparison.reason,
    metadata: candidateEntry.metadata,
    aggregate: candidateEntry.aggregate
  });

  notePhaseChange(`promoted:${evaluationKind}`);
}

async function runBootstrapCatalogRound(sessionAttemptCount, candidateEvaluations, activeBootstrapParent) {
  const learningPhase = session.learningPhase;
  const round = {
    roundIndex: session.bootstrapCatalogRounds.length + 1,
    startedAt: new Date().toISOString(),
    learningPhase,
    screened: [],
    confirmed: [],
    promotedCandidateId: null
  };

  const catalogParent = activeBootstrapParent ?? championEntry;
  const catalog = createBootstrapCatalog(catalogParent.policy, {
    learningPhase,
    limit: Math.min(config.bootstrapCatalogSize, remainingAttempts(sessionAttemptCount))
  });
  const screenedEntries = [];
  let promoted = false;
  let localAttemptCount = sessionAttemptCount;
  let localCandidateEvaluations = candidateEvaluations;
  let nextBootstrapParent = activeBootstrapParent;

  for (const archetype of catalog) {
    if (!canSpendEpisodes(localAttemptCount, config.candidateScreenDeaths)) {
      break;
    }
    if (localCandidateEvaluations >= config.maxCandidates) {
      break;
    }

    const candidateEntry = createCandidatePolicyRecord({
      id: allocateCandidateId(),
      label: `screen-${archetype.label}`,
      parentId: catalogParent.id,
      policy: archetype.policy,
      learningPhase,
      metadata: {
        origin: "bootstrap-catalog",
        stage: "screen",
        archetype: archetype.archetype,
        roundIndex: round.roundIndex
      }
    });

    localCandidateEvaluations += 1;
    const evaluation = await evaluatePolicy(candidateEntry, config.candidateScreenDeaths);
    localAttemptCount += config.candidateScreenDeaths;

    candidateEntry.aggregate = evaluation.aggregate;
    candidateEntry.episodes = evaluation.episodes;

    const comparison = compareBatchMetrics(candidateEntry.aggregate, championEntry.aggregate, {
      learningPhase
    });

    await writeCandidateSummary(
      layout,
      candidateEntry.id,
      buildCandidateSummary(
        candidateEntry,
        championEntry,
        comparison,
        "bootstrap-screen",
        learningPhase,
        {
          bootstrapCatalog: true,
          roundIndex: round.roundIndex,
          screenDeaths: config.candidateScreenDeaths
        }
      )
    );

    recordContactSignal(candidateEntry);
    screenedEntries.push(candidateEntry);
    round.screened.push({
      candidateId: candidateEntry.id,
      label: candidateEntry.label,
      archetype: candidateEntry.metadata.archetype,
      aggregate: candidateEntry.aggregate,
      decision: comparison
    });
  }

  const rankedScreens = sortEntriesForPhase(screenedEntries, learningPhase);
  const toConfirm = rankedScreens.slice(0, Math.min(config.bootstrapConfirmCount, rankedScreens.length));

  if (rankedScreens[0]?.aggregate && (rankedScreens[0].aggregate.hitPositive || rankedScreens[0].aggregate.killPositive)) {
    nextBootstrapParent = rankedScreens[0];
  }

  for (const screenEntry of toConfirm) {
    if (!canSpendEpisodes(localAttemptCount, config.candidateDeaths)) {
      break;
    }
    if (localCandidateEvaluations >= config.maxCandidates) {
      break;
    }

    const candidateEntry = createCandidatePolicyRecord({
      id: allocateCandidateId(),
      label: `confirm-${screenEntry.metadata.archetype}`,
      parentId: screenEntry.id,
      policy: screenEntry.policy,
      learningPhase,
      metadata: {
        ...screenEntry.metadata,
        stage: "confirm",
        screenedFromId: screenEntry.id
      }
    });

    localCandidateEvaluations += 1;
    const evaluation = await evaluatePolicy(candidateEntry, config.candidateDeaths);
    localAttemptCount += config.candidateDeaths;

    candidateEntry.aggregate = evaluation.aggregate;
    candidateEntry.episodes = evaluation.episodes;

    const comparison = compareBatchMetrics(candidateEntry.aggregate, championEntry.aggregate, {
      learningPhase
    });

    await writeCandidateSummary(
      layout,
      candidateEntry.id,
      buildCandidateSummary(
        candidateEntry,
        championEntry,
        comparison,
        "bootstrap-confirm",
        learningPhase,
        {
          bootstrapCatalog: true,
          roundIndex: round.roundIndex,
          candidateDeaths: config.candidateDeaths,
          screenedFromId: screenEntry.id
        }
      )
    );

    round.confirmed.push({
      candidateId: candidateEntry.id,
      label: candidateEntry.label,
      archetype: candidateEntry.metadata.archetype,
      aggregate: candidateEntry.aggregate,
      decision: comparison
    });

    recordContactSignal(candidateEntry);

    if (comparison.promote) {
      await promoteCandidate(candidateEntry, comparison, "bootstrap-confirm");
      promoted = true;
      nextBootstrapParent = championEntry;
      round.promotedCandidateId = candidateEntry.id;
      break;
    }

    session.rejections.push({
      candidateId: candidateEntry.id,
      evaluationKind: "bootstrap-confirm",
      learningPhase: comparison.phase,
      reason: comparison.reason,
      metadata: candidateEntry.metadata,
      aggregate: candidateEntry.aggregate
    });

    if (candidateEntry.aggregate.hitPositive || candidateEntry.aggregate.killPositive) {
      nextBootstrapParent = candidateEntry;
    }
  }

  round.finishedAt = new Date().toISOString();
  session.bootstrapCatalogRounds.push(round);

  return {
    sessionAttemptCount: localAttemptCount,
    candidateEvaluations: localCandidateEvaluations,
    activeBootstrapParent: nextBootstrapParent,
    promoted
  };
}

const startedMs = Date.now();
let sessionAttemptCount = 0;
let candidateEvaluations = 0;
let stagnationCount = 0;
let fatalError = null;
let activeBootstrapParent = null;
let lastCatalogPhase = null;
let lastCatalogStagnation = -1;

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
    recordContactSignal(championEntry);

    await persistChampionState();
    await ensureChampionSummaryRecorded(championEntry, "seed-baseline");
  } else {
    hallOfFame = upsertHallOfFame(hallOfFame, championEntry);
    await ensureChampionSummaryRecorded(championEntry, "loaded-champion");
  }

  session.initialChampion = {
    id: championEntry.id,
    label: championEntry.label,
    learningPhase: championEntry.learningPhase,
    aggregate: championEntry.aggregate
  };
  notePhaseChange("initial");
  if (championEntry.aggregate?.hitPositive || championEntry.aggregate?.killPositive) {
    activeBootstrapParent = championEntry;
  }

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

    if (!canSpendEpisodes(sessionAttemptCount, config.candidateScreenDeaths)) {
      session.stopReason = "attempt-budget";
      break;
    }

    const shouldRunCatalog = session.learningPhase !== LEARNING_PHASES.STABILIZE_SCORE && (
      lastCatalogPhase !== session.learningPhase
      || (
        stagnationCount >= config.bootstrapRescreenThreshold
        && lastCatalogStagnation !== stagnationCount
      )
    );

    if (shouldRunCatalog) {
      const catalogResult = await runBootstrapCatalogRound(
        sessionAttemptCount,
        candidateEvaluations,
        activeBootstrapParent
      );
      sessionAttemptCount = catalogResult.sessionAttemptCount;
      candidateEvaluations = catalogResult.candidateEvaluations;
      activeBootstrapParent = catalogResult.activeBootstrapParent;
      lastCatalogPhase = session.learningPhase;
      lastCatalogStagnation = stagnationCount;

      if (catalogResult.promoted) {
        stagnationCount = 0;
      } else {
        stagnationCount += 1;
      }

      await safeSupportiveWrite("scoreboard", async () => {
        await writeScoreboard(layout, buildScoreboardPayload(sessionAttemptCount, candidateEvaluations, stagnationCount));
      });

      if (consoleRecorder.counts().errorCount > 0) {
        throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
      }

      continue;
    }

    if (!canSpendEpisodes(sessionAttemptCount, config.candidateDeaths)) {
      session.stopReason = "attempt-budget";
      break;
    }

    const explorationScale = 1 + (stagnationCount / Math.max(1, config.stagnationLimit));
    const parentEntry = chooseMutationParent(activeBootstrapParent);
    const candidateEntry = createCandidatePolicyRecord({
      id: allocateCandidateId(),
      label: `candidate-${candidateEvaluations + 1}`,
      parentId: parentEntry.id,
      policy: mutatePolicy(parentEntry.policy, {
        rng,
        learningPhase: session.learningPhase,
        explorationScale
      }),
      learningPhase: session.learningPhase,
      metadata: {
        origin: "mutation",
        parentSource: parentEntry === activeBootstrapParent
          ? "active-bootstrap-parent"
          : parentEntry === championEntry
            ? "champion"
            : "hall-of-fame"
      }
    });

    candidateEvaluations += 1;

    const evaluation = await evaluatePolicy(candidateEntry, config.candidateDeaths);
    sessionAttemptCount += config.candidateDeaths;

    candidateEntry.aggregate = evaluation.aggregate;
    candidateEntry.episodes = evaluation.episodes;

    const comparison = compareBatchMetrics(candidateEntry.aggregate, championEntry.aggregate, {
      learningPhase: session.learningPhase
    });

    await writeCandidateSummary(
      layout,
      candidateEntry.id,
      buildCandidateSummary(
        candidateEntry,
        championEntry,
        comparison,
        "candidate-batch",
        session.learningPhase,
        {
          candidateDeaths: config.candidateDeaths,
          explorationScale
        }
      )
    );

    recordContactSignal(candidateEntry);

    if (comparison.promote) {
      await promoteCandidate(candidateEntry, comparison, "candidate-batch");
      activeBootstrapParent = championEntry;
      stagnationCount = 0;
    } else {
      session.rejections.push({
        candidateId: candidateEntry.id,
        evaluationKind: "candidate-batch",
        learningPhase: comparison.phase,
        reason: comparison.reason,
        metadata: candidateEntry.metadata,
        aggregate: candidateEntry.aggregate
      });
      if (candidateEntry.aggregate.hitPositive || candidateEntry.aggregate.killPositive) {
        activeBootstrapParent = candidateEntry;
      }
      stagnationCount += 1;
    }

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
  notePhaseChange("final");
  session.finalChampion = championEntry
    ? {
        id: championEntry.id,
        label: championEntry.label,
        learningPhase: championEntry.learningPhase,
        metadata: championEntry.metadata,
        policy: championEntry.policy,
        aggregate: championEntry.aggregate
      }
    : null;
  session.keyLessonsLearned = (semanticMemory.notes ?? []).slice(-6).map((entry) => entry.text);
  session.contactSignals = (semanticMemory.contactSignals ?? []).slice(-6);
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
  learningPhase: session.learningPhase,
  targetMode: session.targetMode,
  championId: session.finalChampion?.id ?? null,
  championLabel: session.finalChampion?.label ?? null,
  aggregate: session.finalChampion?.aggregate ?? null,
  warnings: session.warnings,
  outputDir: config.outputDir,
  userDataDir: config.userDataDir
}, null, 2));
