import path from "node:path";
import { DEFAULT_VIEWPORT } from "./browser.mjs";
import { readJsonIfExists, writeJson } from "../utils/fs.mjs";
import { DEFAULT_ADAPTIVE_SWEEPER_POLICY, normalizeAdaptiveSweeperPolicy } from "../policies/adaptive-sweeper.mjs";

const ROOT = process.cwd();
const env = (name, fallback) => process.env[name] || fallback;
function number(name, fallback, minimum = 0, integer = false) {
  const value = Number(env(name, fallback));
  if (!Number.isFinite(value) || value < minimum || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? "an integer" : "a finite number"} >= ${minimum}.`);
  }
  return value;
}
function boolean(name, fallback) {
  const value = String(env(name, fallback));
  if (!/^(true|false|1|0|yes|no)$/i.test(value)) throw new Error(`${name} must be true or false.`);
  return /^(true|1|yes)$/i.test(value);
}
export async function loadLearningConfig(configPath = path.resolve(ROOT, "config/learning.config.json")) {
  return readJsonIfExists(configPath, {});
}
// Kept for callers of the optional legacy parameter tuner.
export async function loadDefaultPolicy(policyPath = path.resolve(ROOT, "config/default-policy.json")) {
  return normalizeAdaptiveSweeperPolicy(await readJsonIfExists(policyPath, DEFAULT_ADAPTIVE_SWEEPER_POLICY));
}
async function resolveConfig(mode) {
  const file = await loadLearningConfig();
  const rawUrl = env("BASE_URL", file.baseUrl);
  if (!rawUrl) throw new Error("BASE_URL is required. Configure an authorized game deployment explicitly.");
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("BASE_URL must be an HTTP(S) URL without credentials.");
  }
  const watchMode = boolean("WATCH_MODE", file.watchMode ?? false);
  const output = mode === "smoke"
    ? env("SMOKE_OUTPUT_DIR", `output/no-context-smoke/${new Date().toISOString().replace(/[:.]/g, "-")}`)
    : mode === "baseline"
      ? env("BASELINE_OUTPUT_DIR", file.baselineOutputDir ?? "output/baseline")
      : env("OUTPUT_DIR", file.outputDir ?? "output/self-improving-runner");
  return {
    mode, baseUrl: url.toString(), viewport: DEFAULT_VIEWPORT,
    agentName: env("AGENT_NAME", file.agentName ?? "ClawdLearner"),
    modelProvider: env("MODEL_PROVIDER", file.modelProvider ?? "metadata-only"),
    modelName: env("MODEL_NAME", file.modelName ?? "visible-target"),
    watchMode, headless: boolean("HEADLESS", watchMode ? false : file.headless ?? true),
    attemptBudget: number("ATTEMPT_BUDGET", file.attemptBudget ?? 10, 1, true),
    timeBudgetMinutes: number("TIME_BUDGET_MINUTES", file.timeBudgetMinutes ?? 20),
    learningEnabled: boolean("LEARNING_ENABLED", file.learningEnabled ?? true),
    stepMs: number("STEP_MS", file.stepMs ?? 125, 1, true),
    maxStepsPerEpisode: number("MAX_STEPS_PER_EPISODE", file.maxStepsPerEpisode ?? 2400, 1, true),
    batchEpisodes: number("BATCH_EPISODES", file.batchEpisodes ?? 5, 1, true),
    targetEpisodes: number("BASELINE_DEATHS", file.baselineDeaths ?? 5, 1, true),
    requiredSmokeDeaths: number("REQUIRED_DEATHS", file.requiredSmokeDeaths ?? 1, 1, true),
    smokeMaxSteps: number("SMOKE_MAX_STEPS", file.smokeMaxSteps ?? 2400, 1, true),
    outputDir: path.resolve(ROOT, output),
    userNotes: env("USER_NOTES", file.userNotes ?? "")
  };
}
export const resolveSmokeConfig = () => resolveConfig("smoke");
export const resolveBaselineConfig = () => resolveConfig("baseline");
export const resolveLearningRunConfig = () => resolveConfig("learn");
export async function persistResolvedConfig(outputDir, config) {
  await writeJson(path.join(outputDir, "resolved-run-config.json"), config);
}
