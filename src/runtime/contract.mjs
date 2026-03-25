export const PUBLIC_AGENT_API_VERSION = 1;
export const PUBLIC_AGENT_CONTRACT = "public-agent-v1";
export const PUBLIC_AGENT_WORKFLOW_CONTRACT = "agentic-gameplay-v1";

export const PUBLIC_AGENT_CANONICAL_HOST = "https://clawd-strike.vercel.app/";
export const PUBLIC_AGENT_CANONICAL_SKILLS_URL = "https://clawd-strike.vercel.app/skills.md";
export const PUBLIC_AGENT_COMPANION_REPO_NAME = "clawd-strike-agent-sdk";
export const PUBLIC_AGENT_COMPANION_REPO_URL = "https://github.com/dimitricritsinelis/clawd-strike-agent-sdk";

export const PUBLIC_AGENT_NAME_MAX_LENGTH = 15;
export const PUBLIC_AGENT_ALLOWED_NAME_REGEX = /^[A-Za-z0-9 ._\-']{1,15}$/;

export const PUBLIC_AGENT_STABLE_SELECTORS = Object.freeze({
  agentMode: '[data-testid="agent-mode"]',
  play: '[data-testid="play"]',
  agentName: '[data-testid="agent-name"]',
  playAgain: '[data-testid="play-again"]'
});

export const PUBLIC_AGENT_SUPPORTED_GLOBALS = Object.freeze([
  "agent_observe",
  "render_game_to_text",
  "agent_apply_action",
  "advanceTime"
]);

export const PUBLIC_AGENT_DISALLOWED_TRUTHS = Object.freeze([
  "coordinates",
  "map zones",
  "landmark ids",
  "enemy positions",
  "hidden line-of-sight truth",
  "routes",
  "seeds",
  "debug state"
]);

export const PUBLIC_AGENT_REQUIRED_LEARNING_OUTPUTS = Object.freeze([
  "output/self-improving-runner/champion-policy.json",
  "output/self-improving-runner/episodes.jsonl",
  "output/self-improving-runner/latest-session-summary.json",
  "output/self-improving-runner/candidate-summaries/*.json"
]);
