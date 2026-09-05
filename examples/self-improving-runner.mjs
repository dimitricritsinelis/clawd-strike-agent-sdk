import path from "node:path";
import { readFile, open, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { launchBrowser, gotoAgentRuntime, releaseInputs } from "../src/runtime/browser.mjs";
import { runPolicyEpisodes } from "../src/runtime/episode-runner.mjs";
import { resolveLearningRunConfig, persistResolvedConfig } from "../src/runtime/config.mjs";
import { aggregateEpisodes, compareBatchMetrics } from "../src/learn/optimizer.mjs";
import {
  createLearningSessionId, ensureLearningLayout, recordEpisode, writeChampion,
  writeCandidateSummary, writeLatestSessionSummary, writeScoreboard
} from "../src/learn/storage.mjs";
import { readJsonIfExists, fileExists } from "../src/utils/fs.mjs";

const POLICY_PATH = path.resolve("src/policies/visible-target.mjs");
const hash = (source) => createHash("sha256").update(source).digest("hex");
async function loadController(snapshot) {
  if (hash(snapshot.source) !== snapshot.id) throw new Error("Saved policy source does not match its SHA-256 identity.");
  const module = await import(`data:text/javascript;base64,${Buffer.from(snapshot.source).toString("base64")}`);
  if (typeof module.createVisibleTargetController !== "function") {
    throw new Error("Policy must export createVisibleTargetController() and be a self-contained module.");
  }
  return module.createVisibleTargetController();
}
async function recoverBest(layout) {
  let best = null;
  if (await fileExists(layout.episodesPath)) {
    const lines = createInterface({ input: createReadStream(layout.episodesPath), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const episode = JSON.parse(line);
      if (aggregateEpisodes([episode]).completedEpisodes === 1
        && (!best || episode.finalScore > best.finalScore)) best = episode;
    }
  }
  return best;
}

// One invocation plays a batch, or evaluates one source edit against the saved code.
// Reasoning and editing belong to the surrounding agent, outside this runner.
export async function runLearningSession(config, dependencies = {}) {
  const launch = dependencies.launchBrowser ?? launchBrowser;
  const enter = dependencies.gotoAgentRuntime ?? gotoAgentRuntime;
  const runEpisodes = dependencies.runPolicyEpisodes ?? runPolicyEpisodes;
  const release = dependencies.releaseInputs ?? releaseInputs;
  const layout = await ensureLearningLayout(config.outputDir);
  const lockPath = path.join(config.outputDir, ".run.lock");
  const lock = await open(lockPath, "wx").catch((error) => {
    if (error.code === "EEXIST") throw new Error(`Output directory already in use: ${lockPath}. If its process died, remove only this lock before retrying.`);
    throw error;
  });
  let resources;
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const session = {
    id: createLearningSessionId("learn"), candidateRetained: false, startedAt: new Date().toISOString(),
    config, completedAttempts: 0, evaluations: [], decision: { promote: false, reason: "No comparison completed." }
  };
  const deadlineMs = config.timeBudgetMinutes > 0 ? Date.now() + config.timeBudgetMinutes * 60_000 : Infinity;
  let champion;
  let best;
  let bestRecovered = false;
  let runtimeEntered = false;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, sessionId: session.id }));
    await persistResolvedConfig(config.outputDir, config);
    const source = await readFile(dependencies.policyPath ?? POLICY_PATH, "utf8");
    const candidate = { id: hash(source), label: "visible-target", source, sourcePath: "src/policies/visible-target.mjs" };
    champion = await readJsonIfExists(layout.championPath, null);
    if (champion && (typeof champion.source !== "string" || hash(champion.source) !== champion.id)) {
      throw new Error("Saved champion has no valid code snapshot. Preserve its history and select a fresh OUTPUT_DIR for this SDK contract.");
    }
    best = await recoverBest(layout);
    bestRecovered = true;
    const firstRun = !champion;
    champion ??= candidate;
    const edited = config.mode !== "baseline" && config.learningEnabled && champion.id !== candidate.id;
    session.initialChampionId = champion.id;
    session.candidateId = candidate.id;
    session.policyChanged = edited;
    // Validate both modules before opening the game or changing accepted state.
    await loadController(champion);
    if (edited) await loadController(candidate);
    if (Date.now() >= deadlineMs || abort.signal.aborted) {
      session.stopReason = abort.signal.aborted ? "stopped" : "budget_exhausted";
      return session;
    }
    resources = await launch({ headless: config.headless, viewport: config.viewport, timeoutMs: Math.min(30_000, deadlineMs - Date.now()), deadlineMs, signal: abort.signal });
    await enter(resources.page, { baseUrl: config.baseUrl, agentName: config.agentName, deadlineMs, signal: abort.signal });
    runtimeEntered = true;
    if (firstRun) await writeChampion(layout, { ...champion, acceptedAt: null, evidence: null });
    const expectedEpisodes = config.mode === "baseline" ? config.targetEpisodes : config.batchEpisodes;
    const batches = edited ? [champion, candidate] : [champion];
    for (const policy of batches) {
      const evaluationId = `${session.id}-${session.evaluations.length}`;
      const remaining = config.attemptBudget - session.completedAttempts;
      if (remaining <= 0) { session.stopReason = "attempt_budget"; break; }
      const result = await runEpisodes({
        page: resources.page, controller: await loadController(policy),
        policyEntry: policy, targetEpisodes: Math.min(expectedEpisodes, remaining),
        stepMs: config.stepMs, maxStepsPerEpisode: config.maxStepsPerEpisode,
        deadlineMs, signal: abort.signal,
        onEpisodeRecorded: async (episode) => {
          const record = { ...episode, sessionId: session.id, evaluationId, policyId: policy.id,
            baseUrl: config.baseUrl, execution: { headless: config.headless, viewport: config.viewport, stepMs: config.stepMs,
              maxStepsPerEpisode: config.maxStepsPerEpisode } };
          await recordEpisode(layout, record);
          session.completedAttempts += 1;
          if (aggregateEpisodes([record]).completedEpisodes === 1 && (!best || record.finalScore > best.finalScore)) best = record;
          await writeScoreboard(layout, { bestEver: best, acceptedPolicyId: champion.id });
          console.log(JSON.stringify({ attempt: session.completedAttempts, policyId: policy.id,
            score: record.finalScore, kills: record.kills, hits: record.shotsHit, shots: record.shotsFired,
            survivalTimeS: record.survivalTimeS, deathCause: record.deathCause, valid: record.valid }));
        }
      });
      const evaluation = { id: evaluationId, policy, expectedEpisodes, ...result,
        aggregate: aggregateEpisodes(result.episodes), config };
      session.evaluations.push(evaluation);
      if (result.status !== "completed") { session.stopReason = result.status; break; }
    }
    if (edited && session.evaluations.length === 2) {
      const [control, trial] = session.evaluations;
      const identities = [...control.episodes, ...trial.episodes].map((episode) => JSON.stringify(episode.executionIdentity));
      const sameConditions = identities.length > 0 && identities[0] !== undefined && identities.every((identity) => identity === identities[0]);
      session.decision = control.status === "completed" && trial.status === "completed" && sameConditions
        ? compareBatchMetrics(trial.aggregate, control.aggregate, { expectedEpisodes })
        : { promote: false, reason: "Incomplete/invalid evaluation or public execution identity changed between episodes." };
    } else {
      session.decision = { promote: false, reason: edited
        ? "Budget did not complete both comparison batches."
        : "Saved policy batch only; no code change evaluated." };
    }
    // Persist immutable evidence before changing the accepted policy pointer.
    for (const evaluation of session.evaluations) {
      await writeCandidateSummary(layout, evaluation.id, { ...evaluation, decision: session.decision, generatedAt: new Date().toISOString() });
    }
    if (session.decision.promote) {
      const accepted = { ...candidate, acceptedAt: new Date().toISOString(), evidence: session.evaluations[1].id };
      await writeChampion(layout, accepted);
      champion = accepted;
      session.candidateRetained = true;
    }
    session.stopReason ??= session.completedAttempts >= config.attemptBudget ? "attempt_budget" : "completed";
    session.failed = ["startup_failure", "contract_mismatch", "runtime_error", "timeout"].includes(session.stopReason);
    session.failure = session.evaluations.find((item) => item.error)?.error ?? null;
    const completed = session.evaluations.flatMap((item) => item.episodes).slice(0, 5);
    session.baselineMet = !edited && completed.some((episode) => episode.valid !== false && episode.kills > 0);
    session.acquisitionMet = completed.some((episode) => episode.valid !== false && episode.shotsHit > 0);
  } catch (error) {
    session.stopReason = ["startup_failure", "contract_mismatch", "runtime_error", "timeout", "budget_exhausted", "stopped"].includes(error.code)
      ? error.code : runtimeEntered ? "runtime_error" : "startup_failure";
    session.failed = !["stopped", "budget_exhausted"].includes(session.stopReason);
    session.failure = error.message;
  } finally {
    if (resources) {
      try { if (!resources.page.isClosed?.()) await release(resources.page); } catch (error) {
        session.failed = true; session.failure ??= `Failed to release inputs: ${error.message}`;
      }
      try { await resources.context?.close(); await resources.browser?.close(); } catch (error) {
        session.failed = true; session.failure ??= error.message;
      }
    }
    session.finishedAt = new Date().toISOString();
    session.finalChampionId = champion?.id ?? null;
    session.bestEverScore = best?.finalScore ?? null;
    session.outputDir = config.outputDir;
    try {
      if (bestRecovered) await writeScoreboard(layout, { bestEver: best ?? null, acceptedPolicyId: champion?.id ?? null });
      await writeLatestSessionSummary(layout, session);
    } finally {
      process.off("SIGINT", stop); process.off("SIGTERM", stop);
      await lock.close(); await unlink(lockPath);
    }
  }
  return session;
}

export async function main(config) {
  const session = await runLearningSession(config ?? await resolveLearningRunConfig());
  console.log(JSON.stringify({
    stopReason: session.stopReason, completedAttempts: session.completedAttempts,
    championScores: session.evaluations[0]?.episodes.map((episode) => episode.finalScore) ?? [],
    candidateScores: session.evaluations[1]?.episodes.map((episode) => episode.finalScore) ?? [],
    retained: session.candidateRetained, decision: session.decision,
    baselineMet: session.baselineMet, bestEverScore: session.bestEverScore,
    policyPath: path.join(session.outputDir, "champion-policy.json"),
    resultsPath: path.join(session.outputDir, "episodes.jsonl"),
    summaryPath: path.join(session.outputDir, "latest-session-summary.json"), failure: session.failure
  }, null, 2));
  if (session.failed) process.exitCode = 1;
  return session;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
