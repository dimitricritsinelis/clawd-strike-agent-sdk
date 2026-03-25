import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readdir, readFile } from "node:fs/promises";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
const BANNED_SHADOW_FILES = [
  "README 2.md",
  "package 2.json",
  "skills 2.md"
];

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8"));
}

async function readText(relativePath) {
  return await readFile(path.join(projectRoot, relativePath), "utf8");
}

async function walkInventory(rootDir, relativeDir = "") {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const inventory = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const relativePath = relativeDir
      ? path.posix.join(relativeDir, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      inventory.push(...await walkInventory(rootDir, relativePath));
      continue;
    }

    inventory.push(relativePath);
  }

  return inventory;
}

function buildCaseIndex(inventory) {
  const index = new Map();

  for (const relativePath of inventory) {
    const key = relativePath.toLowerCase();
    const bucket = index.get(key) ?? [];
    bucket.push(relativePath);
    index.set(key, bucket);
  }

  return index;
}

function assertOrderedSnippets(text, snippets, label) {
  let cursor = -1;

  for (const snippet of snippets) {
    const index = text.indexOf(snippet, cursor + 1);
    if (index === -1) {
      throw new Error(`${label} is missing required content: ${snippet}`);
    }
    cursor = index;
  }
}

async function main() {
  const manifest = await readJson("sdk.contract.json");
  const packageJson = await readJson("package.json");
  const inventory = await walkInventory(projectRoot);
  const inventorySet = new Set(inventory);
  const caseIndex = buildCaseIndex(inventory);

  for (const shadowFile of BANNED_SHADOW_FILES) {
    if (inventorySet.has(shadowFile)) {
      throw new Error(`Banned shadow file must not exist: ${shadowFile}`);
    }
  }

  const troubleshootingVariants = caseIndex.get("docs/troubleshooting.md") ?? [];
  if (troubleshootingVariants.length > 1) {
    throw new Error(
      `Only one troubleshooting path variant may exist. Found: ${troubleshootingVariants.join(", ")}`
    );
  }

  if (inventorySet.has("docs/troubleshooting.md")) {
    throw new Error("Lowercase docs/troubleshooting.md must not exist; use docs/TROUBLESHOOTING.md.");
  }

  for (const scriptName of manifest.requiredScripts) {
    if (!packageJson.scripts?.[scriptName]) {
      throw new Error(`Missing required package.json script: ${scriptName}`);
    }
  }

  for (const relativePath of manifest.requiredFiles) {
    if (inventorySet.has(relativePath)) {
      continue;
    }

    const caseMatches = caseIndex.get(relativePath.toLowerCase()) ?? [];
    if (caseMatches.length > 0) {
      throw new Error(
        `Case mismatch for required file '${relativePath}'. Found: ${caseMatches.join(", ")}`
      );
    }

    throw new Error(`Missing required file: ${relativePath}`);
  }

  const agentsText = await readText("AGENTS.md");
  const claudeText = await readText("CLAUDE.md");
  if (agentsText !== claudeText) {
    throw new Error("AGENTS.md and CLAUDE.md must be identical.");
  }

  const skillsText = await readText("skills.md");
  assertOrderedSnippets(skillsText, [
    "1. `README.md`",
    "2. `AGENTS.md` or `CLAUDE.md`",
    "3. `docs/PUBLIC_CONTRACT.md`",
    "4. `MEMORY.md`",
    "5. `SELF_LEARNING.md`",
    "6. `docs/OUTPUTS.md`",
    "7. `docs/POLICY_SCHEMA.md`",
    "8. `docs/TROUBLESHOOTING.md`"
  ], "skills.md");

  for (const requiredSnippet of [
    manifest.companionRepo.url,
    "pnpm smoke:no-context",
    "pnpm agent:baseline",
    "pnpm agent:learn",
    manifest.runtimeContract.name,
    ...manifest.requiredLearningOutputs
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
  if (contractModule.PUBLIC_AGENT_WORKFLOW_CONTRACT !== manifest.workflowContract) {
    throw new Error("src/runtime/contract.mjs has the wrong PUBLIC_AGENT_WORKFLOW_CONTRACT.");
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
