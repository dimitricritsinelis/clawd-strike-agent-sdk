import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { readTextIfExists, writeText } from "../../src/utils/fs.mjs";

const projectRoot = process.cwd();
const skillsPath = path.join(projectRoot, "skills.md");
const skillsText = await readTextIfExists(skillsPath, null);

if (skillsText === null) {
  throw new Error(`Unable to read ${skillsPath}`);
}

const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "clawd-fresh-agent-"));
await writeText(path.join(workspaceDir, "skills.md"), skillsText);
await writeText(path.join(workspaceDir, "AGENTS.md"), [
  "# Fresh Agent Test Instructions",
  "",
  "Read `skills.md` and treat it as instructions.",
  "Do not rewrite or mirror `skills.md` as the primary task.",
  "",
  "Create `progress_report.md` and keep it as a detailed journal of all the work you did.",
  "Include at least:",
  "- what you were instructed to do",
  "- what you actually did",
  "- key decisions you made and why",
  "- what assumptions you made about the environment",
  "- what you think went well",
  "- what failed or was unclear, including the exact instruction text involved when possible",
  "- what you should have done differently",
  "- why you stopped when you did",
  "- what files or artifacts you created or expected to create",
  "- top 3 concrete suggestions for improving the instructions or SDK",
  "",
  "Leave `progress_report.md` in this workspace when you finish."
].join("\n"));

console.log(JSON.stringify({
  mode: "fresh-agent-workspace",
  workspaceDir,
  files: [
    path.join(workspaceDir, "skills.md"),
    path.join(workspaceDir, "AGENTS.md")
  ]
}, null, 2));
