import path from "node:path";
import {
  PUBLIC_AGENT_ALLOWED_NAME_REGEX,
  PUBLIC_AGENT_CANONICAL_HOST,
  PUBLIC_AGENT_NAME_MAX_LENGTH,
  PUBLIC_AGENT_STABLE_SELECTORS,
  PUBLIC_AGENT_SUPPORTED_GLOBALS
} from "./contract.mjs";
import { ensureDir } from "../utils/fs.mjs";

export const DEFAULT_AGENT_NAME = "StarterAgent";
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

export function sanitizeAgentName(value, fallback = DEFAULT_AGENT_NAME) {
  const raw = typeof value === "string" ? value.trim() : "";
  const cleaned = raw
    .replace(/[^A-Za-z0-9 ._\-']/g, "")
    .slice(0, PUBLIC_AGENT_NAME_MAX_LENGTH)
    .trim();

  if (cleaned.length > 0 && PUBLIC_AGENT_ALLOWED_NAME_REGEX.test(cleaned)) {
    return cleaned;
  }

  return fallback;
}

export function buildRuntimeUrl(baseUrl = PUBLIC_AGENT_CANONICAL_HOST, options = {}) {
  const {
    agentName = DEFAULT_AGENT_NAME,
    autostart = "agent",
    extraSearchParams = {}
  } = options;

  const url = new URL("/", baseUrl);
  url.searchParams.set("autostart", autostart);
  url.searchParams.set("name", sanitizeAgentName(agentName));

  for (const [key, rawValue] of Object.entries(extraSearchParams)) {
    if (rawValue === undefined || rawValue === null || rawValue === false) continue;
    url.searchParams.set(key, String(rawValue));
  }

  return url.toString();
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function launchBrowser(options = {}) {
  const { chromium } = await import("playwright");
  const { headless = true, viewport = DEFAULT_VIEWPORT } = options;

  const browser = await chromium
    .launch({ channel: "chrome", headless })
    .catch(() => chromium.launch({ headless }));

  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { browser, context, page };
}

export async function launchPersistentBrowser(options = {}) {
  const { chromium } = await import("playwright");
  const {
    headless = true,
    viewport = DEFAULT_VIEWPORT,
    userDataDir = path.resolve(process.cwd(), ".agent-profile")
  } = options;

  await ensureDir(userDataDir);

  const context = await chromium
    .launchPersistentContext(userDataDir, { channel: "chrome", headless, viewport })
    .catch(() => chromium.launchPersistentContext(userDataDir, { headless, viewport }));

  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, userDataDir };
}

export function attachConsoleRecorder(page) {
  const events = [];

  const push = (event) => {
    events.push({
      ...event,
      recordedAt: new Date().toISOString()
    });
  };

  page.on("console", (message) => {
    push({
      kind: "console",
      type: message.type(),
      text: message.text(),
      location: message.location()
    });
  });

  page.on("pageerror", (error) => {
    push({
      kind: "pageerror",
      type: "error",
      text: error.message,
      stack: error.stack ?? null
    });
  });

  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "request failed";
    const aborted = /ERR_ABORTED|NS_BINDING_ABORTED|aborted|cancelled/i.test(errorText);

    push({
      kind: "requestfailed",
      type: aborted ? "warning" : "error",
      text: errorText,
      url: request.url(),
      method: request.method()
    });
  });

  return {
    clear() {
      events.length = 0;
    },
    snapshot() {
      return events.map((event) => ({ ...event }));
    },
    counts() {
      const errorCount = events.filter((event) => event.type === "error" || event.kind === "pageerror").length;
      const warningCount = events.filter((event) => event.type === "warning" || event.type === "warn").length;
      return { errorCount, warningCount, total: events.length };
    }
  };
}

export async function readState(page) {
  const state = await page.evaluate(() => {
    const read = () => {
      if (typeof window.agent_observe === "function") return window.agent_observe();
      if (typeof window.render_game_to_text === "function") return window.render_game_to_text();
      return null;
    };

    const raw = read();
    if (typeof raw !== "string") return null;

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  if (!state || typeof state !== "object") {
    throw new Error("Documented agent state is unavailable.");
  }

  return state;
}

export async function getAgentApiStatus(page) {
  return await page.evaluate(
    (supportedGlobals) => ({
      agentObserve: typeof window.agent_observe === "function",
      renderGameToText: typeof window.render_game_to_text === "function",
      agentApplyAction: typeof window.agent_apply_action === "function",
      advanceTime: typeof window.advanceTime === "function",
      supportedGlobals
    }),
    PUBLIC_AGENT_SUPPORTED_GLOBALS
  );
}

export function isRuntimeReady(state) {
  return state?.mode === "runtime" && state?.runtimeReady === true;
}

export function isDead(state) {
  return state?.gameplay?.alive === false || state?.gameplay?.gameOverVisible === true;
}

export async function waitForRuntimeReady(page, options = {}) {
  const { timeoutMs = 90_000 } = options;

  await page.waitForFunction(() => {
    const read = () => {
      if (typeof window.agent_observe === "function") return window.agent_observe();
      if (typeof window.render_game_to_text === "function") return window.render_game_to_text();
      return null;
    };

    const raw = read();
    if (typeof raw !== "string") return false;

    try {
      const state = JSON.parse(raw);
      return state.mode === "runtime" && state.runtimeReady === true;
    } catch {
      return false;
    }
  }, { timeout: timeoutMs });

  return await readState(page);
}

export async function waitForRespawn(page, options = {}) {
  const { timeoutMs = 20_000 } = options;

  await page.waitForFunction(() => {
    const read = () => {
      if (typeof window.agent_observe === "function") return window.agent_observe();
      if (typeof window.render_game_to_text === "function") return window.render_game_to_text();
      return null;
    };

    const raw = read();
    if (typeof raw !== "string") return false;

    try {
      const state = JSON.parse(raw);
      return state.mode === "runtime"
        && state.runtimeReady === true
        && state.gameplay?.alive === true
        && state.gameplay?.gameOverVisible !== true;
    } catch {
      return false;
    }
  }, { timeout: timeoutMs });

  return await readState(page);
}

export async function gotoAgentRuntimeViaUi(page, options = {}) {
  const {
    baseUrl = PUBLIC_AGENT_CANONICAL_HOST,
    agentName = DEFAULT_AGENT_NAME
  } = options;

  await page.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.locator(PUBLIC_AGENT_STABLE_SELECTORS.agentMode).click();
  await page.locator(PUBLIC_AGENT_STABLE_SELECTORS.play).click();

  const agentNameInput = page.locator(PUBLIC_AGENT_STABLE_SELECTORS.agentName);
  await agentNameInput.fill(sanitizeAgentName(agentName));
  await agentNameInput.press("Enter");

  return await waitForRuntimeReady(page);
}

export async function gotoAgentRuntimeViaUrl(page, options = {}) {
  const {
    baseUrl = PUBLIC_AGENT_CANONICAL_HOST,
    agentName = DEFAULT_AGENT_NAME,
    extraSearchParams = {}
  } = options;

  await page.goto(buildRuntimeUrl(baseUrl, { agentName, extraSearchParams }), {
    waitUntil: "domcontentloaded"
  });

  return await waitForRuntimeReady(page);
}

export async function gotoAgentRuntime(page, options = {}) {
  try {
    return await gotoAgentRuntimeViaUrl(page, options);
  } catch {
    return await gotoAgentRuntimeViaUi(page, options);
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function sanitizeAction(action = {}) {
  return {
    moveX: clamp(action.moveX, -1, 1),
    moveZ: clamp(action.moveZ, -1, 1),
    lookYawDelta: Number.isFinite(action.lookYawDelta) ? Number(action.lookYawDelta) : undefined,
    lookPitchDelta: Number.isFinite(action.lookPitchDelta) ? Number(action.lookPitchDelta) : undefined,
    jump: Boolean(action.jump),
    fire: Boolean(action.fire),
    reload: Boolean(action.reload),
    crouch: Boolean(action.crouch)
  };
}

export async function applyAction(page, action) {
  const nextAction = sanitizeAction(action);

  await page.evaluate((payload) => {
    window.agent_apply_action?.(payload);
  }, nextAction);
}

export async function advance(page, ms = 500) {
  const usedAdvanceTime = await page.evaluate(async (stepMs) => {
    if (typeof window.advanceTime !== "function") return false;
    await window.advanceTime(stepMs);
    return true;
  }, ms);

  if (!usedAdvanceTime) {
    await page.waitForTimeout(ms);
  }

  return usedAdvanceTime;
}

export async function clickPlayAgainIfVisible(page) {
  const button = page.locator(PUBLIC_AGENT_STABLE_SELECTORS.playAgain);
  const visible = await button.isVisible().catch(() => false);
  if (!visible) return false;

  await button.click().catch(() => {});
  return true;
}

export async function ensureFreshRun(page, options = {}) {
  const {
    waitMs = 500,
    timeoutTicks = 80
  } = options;

  for (let attempt = 0; attempt < timeoutTicks; attempt += 1) {
    const state = await readState(page);

    if (isRuntimeReady(state) && !isDead(state) && (state.score?.current ?? 0) === 0) {
      return state;
    }

    if (isDead(state)) {
      const clicked = await clickPlayAgainIfVisible(page);
      if (clicked) {
        return await waitForRespawn(page);
      }
    }

    await advance(page, waitMs);
  }

  throw new Error("Unable to recover to a fresh living run.");
}

export {
  PUBLIC_AGENT_CANONICAL_HOST,
  PUBLIC_AGENT_NAME_MAX_LENGTH,
  PUBLIC_AGENT_STABLE_SELECTORS,
  PUBLIC_AGENT_SUPPORTED_GLOBALS
} from "./contract.mjs";
