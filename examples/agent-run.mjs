import path from "node:path";
import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import {
  ensureDir,
  evaluateStarterBenchmark,
  fileExists,
  readLearnSummary,
  resolveBaselineConfig,
  resolveLearningRunConfig,
  validateLearningOutputs,
  writeText
} from "../src/index.mjs";

const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const REQUIRED_STEPS = Object.freeze([
  "contract:check",
  "smoke:no-context",
  "agent:baseline",
  "agent:learn"
]);

function runPnpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child = spawn(PNPM_BIN, [scriptName], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `pnpm ${scriptName} terminated by signal ${signal}`
            : `pnpm ${scriptName} exited with code ${code ?? "unknown"}`
        )
      );
    });
  });
}

async function resetManagedOutputDir(outputDir, options = {}) {
  const { includeCandidateSummaries = false } = options;
  await ensureDir(outputDir);
  const entries = await readdir(outputDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === ".gitkeep") {
      continue;
    }

    await rm(path.join(outputDir, entry.name), {
      force: true,
      recursive: true
    });
  }

  if (includeCandidateSummaries) {
    const candidateSummariesDir = path.join(outputDir, "candidate-summaries");
    await ensureDir(candidateSummariesDir);
    await writeText(path.join(candidateSummariesDir, ".gitkeep"), "");

    const candidateEntries = await readdir(candidateSummariesDir, { withFileTypes: true });
    for (const entry of candidateEntries) {
      if (entry.name === ".gitkeep") {
        continue;
      }

      await rm(path.join(candidateSummariesDir, entry.name), {
        force: true,
        recursive: true
      });
    }
  }
}

async function assertBaselineOutput(config) {
  const baselineSummaryPath = path.join(config.outputDir, "latest-session-summary.json");
  if (!(await fileExists(baselineSummaryPath))) {
    throw new Error(`baseline run failed to write ${baselineSummaryPath}`);
  }

  return baselineSummaryPath;
}

async function assertLearnOutputs(config) {
  const outputs = await validateLearningOutputs(config.outputDir);
  if (!outputs.ok) {
    throw new Error(
      `learning run is invalid: missing required outputs ${outputs.missing.join(", ")}`
    );
  }

  const summary = await readLearnSummary(config.outputDir);
  if (!summary) {
    throw new Error("learning run is invalid: latest-session-summary.json is unreadable.");
  }
  if (summary.failed) {
    throw new Error(`learning run reported failure: ${summary.failure ?? "unknown failure"}`);
  }

  const benchmark = evaluateStarterBenchmark(summary);
  if (!benchmark.passed) {
    throw new Error(benchmark.reason);
  }

  return {
    summary,
    outputs,
    benchmark
  };
}

async function main() {
  const baselineConfig = await resolveBaselineConfig();
  const learningConfig = await resolveLearningRunConfig();

  await runPnpmScript(REQUIRED_STEPS[0]);
  await resetManagedOutputDir(baselineConfig.outputDir);
  await resetManagedOutputDir(learningConfig.outputDir, { includeCandidateSummaries: true });

  for (const scriptName of REQUIRED_STEPS.slice(1)) {
    await runPnpmScript(scriptName);
  }

  const baselineSummaryPath = await assertBaselineOutput(baselineConfig);
  const { summary, outputs, benchmark } = await assertLearnOutputs(learningConfig);

  console.log(JSON.stringify({
    ok: true,
    steps: REQUIRED_STEPS,
    baselineSummaryPath,
    learningOutputDir: learningConfig.outputDir,
    candidateSummaryCount: outputs.candidateSummaryCount,
    acquisitionMet: benchmark.acquisitionMet,
    baselineMet: benchmark.baselineMet,
    stopReason: summary.stopReason ?? null
  }, null, 2));
}

await main();
