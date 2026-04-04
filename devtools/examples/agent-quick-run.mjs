import path from "node:path";
import { spawn } from "node:child_process";

const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function runPnpmAgentRun(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(PNPM_BIN, ["agent:run"], {
      cwd: process.cwd(),
      env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(
        signal
          ? `pnpm agent:run terminated by signal ${signal}`
          : `pnpm agent:run exited with code ${code ?? "unknown"}`
      ));
    });
  });
}

const id = runId();
const baseDir = path.join("output", "maintainer-quick", id);

const env = {
  ...process.env,
  ATTEMPT_BUDGET: process.env.ATTEMPT_BUDGET ?? "5",
  BASELINE_DEATHS: process.env.BASELINE_DEATHS ?? "1",
  CANDIDATE_SCREEN_DEATHS: process.env.CANDIDATE_SCREEN_DEATHS ?? "1",
  CANDIDATE_DEATHS: process.env.CANDIDATE_DEATHS ?? "1",
  MAX_CANDIDATES: process.env.MAX_CANDIDATES ?? "2",
  BOOTSTRAP_CATALOG_SIZE: process.env.BOOTSTRAP_CATALOG_SIZE ?? "1",
  BOOTSTRAP_CONFIRM_COUNT: process.env.BOOTSTRAP_CONFIRM_COUNT ?? "1",
  TIME_BUDGET_MINUTES: process.env.TIME_BUDGET_MINUTES ?? "3",
  OUTPUT_DIR: process.env.OUTPUT_DIR ?? path.join(baseDir, "learn"),
  BASELINE_OUTPUT_DIR: process.env.BASELINE_OUTPUT_DIR ?? path.join(baseDir, "baseline"),
  USER_DATA_DIR: process.env.USER_DATA_DIR ?? path.join(".agent-profile-maintainer-quick", id)
};

console.log(JSON.stringify({
  mode: "maintainer-quick-run",
  baseUrl: env.BASE_URL ?? "https://clawd-strike.vercel.app/",
  outputDir: env.OUTPUT_DIR,
  baselineOutputDir: env.BASELINE_OUTPUT_DIR,
  userDataDir: env.USER_DATA_DIR,
  attemptBudget: Number(env.ATTEMPT_BUDGET),
  maxCandidates: Number(env.MAX_CANDIDATES)
}, null, 2));

await runPnpmAgentRun(env);
