import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));
}

async function readText(relativePath) {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}

async function main() {
  const manifest = await readJson("sdk.contract.json");
  const packageJson = await readJson("package.json");

  for (const scriptName of manifest.requiredScripts) {
    if (!packageJson.scripts?.[scriptName]) {
      throw new Error(`Missing required package.json script: ${scriptName}`);
    }
  }

  for (const relativePath of manifest.requiredFiles) {
    try {
      await readFile(path.join(projectRoot, relativePath), "utf8");
    } catch (error) {
      throw new Error(`Missing required file: ${relativePath}`);
    }
  }

  const agentsText = await readText("AGENTS.md");
  const claudeText = await readText("CLAUDE.md");
  if (agentsText !== claudeText) {
    throw new Error("AGENTS.md and CLAUDE.md must be identical.");
  }

  const skillsText = await readText("skills.md");
  for (const requiredSnippet of [
    manifest.companionRepo.url,
    "pnpm smoke:no-context",
    "pnpm agent:baseline",
    "pnpm agent:learn",
    manifest.runtimeContract.name
  ]) {
    if (!skillsText.includes(requiredSnippet)) {
      throw new Error(`skills.md is missing required content: ${requiredSnippet}`);
    }
  }

  const outputsText = await readText("docs/OUTPUTS.md");
  for (const outputPath of manifest.requiredLearningOutputs) {
    if (!outputsText.includes(outputPath)) {
      throw new Error(`docs/OUTPUTS.md is missing required output path: ${outputPath}`);
    }
  }

  const contractModule = await import(pathToFileURL(path.join(projectRoot, "src/runtime/contract.mjs")).href);
  if (contractModule.PUBLIC_AGENT_API_VERSION !== manifest.runtimeContract.apiVersion) {
    throw new Error("src/runtime/contract.mjs has the wrong PUBLIC_AGENT_API_VERSION.");
  }
  if (contractModule.PUBLIC_AGENT_CONTRACT !== manifest.runtimeContract.name) {
    throw new Error("src/runtime/contract.mjs has the wrong PUBLIC_AGENT_CONTRACT.");
  }
  if (contractModule.PUBLIC_AGENT_COMPANION_REPO_URL !== manifest.companionRepo.url) {
    throw new Error("src/runtime/contract.mjs has the wrong companion repo URL.");
  }

  console.log(JSON.stringify({
    ok: true,
    requiredScripts: manifest.requiredScripts,
    requiredFiles: manifest.requiredFiles.length,
    requiredLearningOutputs: manifest.requiredLearningOutputs
  }, null, 2));
}

await main();
