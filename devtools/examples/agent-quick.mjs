import { spawn } from "node:child_process";

const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const child = spawn(PNPM_BIN, ["dev:fresh-agent"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (code === 0) {
    process.exit(0);
    return;
  }

  if (signal) {
    console.error(`pnpm dev:fresh-agent terminated by signal ${signal}`);
    process.exit(1);
    return;
  }

  process.exit(code ?? 1);
});
