import path from "node:path";
import { PUBLIC_AGENT_CANONICAL_HOST } from "./contract.mjs";
import { DEFAULT_ADAPTIVE_SWEEPER_POLICY, normalizeAdaptiveSweeperPolicy } from "../policies/adaptive-sweeper.mjs";
import { readJsonIfExists, writeJson } from "../utils/fs.mjs";

const PROJECT_ROOT = process.cwd();

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function envString(name, fallback) {
  const raw = process.env[name];
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

function envBoolean(name, fallback) {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  return !/^(0|false|no)$/i.test(raw);
}

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadLearningConfig(configPath = path.resolve(PROJECT_ROOT, "config/learning.config.json")) {
  return await readJsonIfExists(configPath, {});
}

export async function loadDefaultPolicy(policyPath = path.resolve(PROJECT_ROOT, "config/default-policy.json")) {
  const raw = await readJsonIfExists(policyPath, DEFAULT_ADAPTIVE_SWEEPER_POLICY);
  return normalizeAdaptiveSweeperPolicy(raw);
}

function resolveBaseConfig(fileConfig = {}) {
  const watchMode = envBoolean("WATCH_MODE", Boolean(fileConfig.watchMode ?? false));
  const headless = envBoolean("HEADLESS", watchMode ? false : Boolean(fileConfig.headless ?? true));

  return {
    baseUrl: new URL(envString("BASE_URL", fileConfig.baseUrl ?? PUBLIC_AGENT_CANONICAL_HOST)).toString(),
    agentName: envString("AGENT_NAME", fileConfig.agentName ?? "ClawdLearner"),
    modelProvider: envString("MODEL_PROVIDER", fileConfig.modelProvider ?? "metadata-only"),
    modelName: envString("MODEL_NAME", fileConfig.modelName ?? "adaptive-sweeper"),
    headless,
    watchMode,
    attemptBudget: Math.max(1, Math.round(envNumber("ATTEMPT_BUDGET", Number(fileConfig.attemptBudget ?? 30)))),
    timeBudgetMinutes: Math.max(0, envNumber("TIME_BUDGET_MINUTES", Number(fileConfig.timeBudgetMinutes ?? 15))),
    learningEnabled: envBoolean("LEARNING_ENABLED", Boolean(fileConfig.learningEnabled ?? true)),
    userNotes: envString("USER_NOTES", fileConfig.userNotes ?? ""),
    stepMs: Math.max(100, Math.round(envNumber("STEP_MS", Number(fileConfig.stepMs ?? 250)))),
    maxStepsPerEpisode: Math.max(100, Math.round(envNumber("MAX_STEPS_PER_EPISODE", Number(fileConfig.maxStepsPerEpisode ?? 800)))),
    baselineDeaths: Math.max(1, Math.round(envNumber("BASELINE_DEATHS", Number(fileConfig.baselineDeaths ?? 5)))),
    candidateDeaths: Math.max(1, Math.round(envNumber("CANDIDATE_DEATHS", Number(fileConfig.candidateDeaths ?? 5)))),
    maxCandidates: Math.max(1, Math.round(envNumber("MAX_CANDIDATES", Number(fileConfig.maxCandidates ?? 50)))),
    stagnationLimit: Math.max(1, Math.round(envNumber("STAGNATION_LIMIT", Number(fileConfig.stagnationLimit ?? 8)))),
    minScoreDelta: envNumber("MIN_SCORE_DELTA", Number(fileConfig.minScoreDelta ?? 0)),
    rngSeed: envNumber("RNG_SEED", Number(fileConfig.rngSeed ?? Date.now())),
    userDataDir: path.resolve(PROJECT_ROOT, envString("USER_DATA_DIR", fileConfig.userDataDir ?? ".agent-profile")),
    outputDir: path.resolve(PROJECT_ROOT, envString("OUTPUT_DIR", fileConfig.outputDir ?? "output/self-improving-runner")),
    baselineOutputDir: path.resolve(PROJECT_ROOT, envString("BASELINE_OUTPUT_DIR", fileConfig.baselineOutputDir ?? "output/baseline")),
    saveMemoryDocs: envBoolean("SAVE_MEMORY_DOCS", Boolean(fileConfig.saveMemoryDocs ?? true)),
    requiredSmokeDeaths: Math.max(1, Math.round(envNumber("REQUIRED_DEATHS", Number(fileConfig.requiredSmokeDeaths ?? 1)))),
    smokeMaxSteps: Math.max(10, Math.round(envNumber("SMOKE_MAX_STEPS", Number(fileConfig.smokeMaxSteps ?? 120))))
  };
}

export async function resolveSmokeConfig() {
  const fileConfig = await loadLearningConfig();
  const base = resolveBaseConfig(fileConfig);
  return {
    ...base,
    mode: "smoke",
    outputDir: path.resolve(PROJECT_ROOT, envString("SMOKE_OUTPUT_DIR", `output/no-context-smoke/${timestampId()}`))
  };
}

export async function resolveBaselineConfig() {
  const fileConfig = await loadLearningConfig();
  const base = resolveBaseConfig(fileConfig);
  return {
    ...base,
    mode: "baseline",
    outputDir: base.baselineOutputDir,
    targetEpisodes: 1
  };
}

export async function resolveLearningRunConfig() {
  const fileConfig = await loadLearningConfig();
  const base = resolveBaseConfig(fileConfig);

  return {
    ...base,
    mode: "learn",
    attemptBudget: Math.max(base.attemptBudget, base.baselineDeaths),
    outputDir: path.resolve(PROJECT_ROOT, envString("OUTPUT_DIR", fileConfig.outputDir ?? "output/self-improving-runner"))
  };
}

export async function persistResolvedConfig(outputDir, config) {
  await writeJson(path.join(outputDir, "resolved-run-config.json"), config);
}
