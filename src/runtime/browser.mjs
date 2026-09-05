import path from "node:path";
import {
  PUBLIC_AGENT_ALLOWED_NAME_REGEX,
  PUBLIC_AGENT_API_VERSION,
  PUBLIC_AGENT_CONTRACT,
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

export function buildRuntimeUrl(baseUrl, options = {}) {
  if (!baseUrl) throw new Error("BASE_URL must explicitly identify the game deployment.");
  const {
    agentName = DEFAULT_AGENT_NAME,
    autostart = "agent",
    extraSearchParams = {}
  } = options;

  const url = new URL(baseUrl);
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
  const { headless = true, viewport = DEFAULT_VIEWPORT, timeoutMs = 30_000 } = options;
  const deadlineMs = Math.min(options.deadlineMs ?? Infinity, Date.now() + timeoutMs);
  const timeout = () => remainingStartupMs(deadlineMs, options.signal);

  const browser = await chromium
    .launch({ channel: "chrome", headless, timeout: timeout() })
    .catch(() => chromium.launch({ headless, timeout: timeout() }));

  try {
    remainingStartupMs(deadlineMs, options.signal);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    remainingStartupMs(deadlineMs, options.signal);
    return { browser, context, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function launchPersistentBrowser(options = {}) {
  const { chromium } = await import("playwright");
  const {
    headless = true,
    viewport = DEFAULT_VIEWPORT,
    timeoutMs = 30_000,
    userDataDir = path.resolve(process.cwd(), ".agent-profile")
  } = options;

  const deadlineMs = Math.min(options.deadlineMs ?? Infinity, Date.now() + timeoutMs);
  const timeout = () => remainingStartupMs(deadlineMs, options.signal);
  await ensureDir(userDataDir);

  const context = await chromium
    .launchPersistentContext(userDataDir, { channel: "chrome", headless, viewport, timeout: timeout() })
    .catch(() => chromium.launchPersistentContext(userDataDir, { headless, viewport, timeout: timeout() }));

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
    throw compatibilityError("Documented agent state is unavailable or malformed.");
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
  }, undefined, { timeout: timeoutMs });

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
  }, undefined, { timeout: timeoutMs });

  return await readState(page);
}

function remainingStartupMs(deadlineMs, signal) {
  if (signal?.aborted) throw Object.assign(new Error("Startup stopped."), { code: "stopped" });
  if (Date.now() >= deadlineMs) throw Object.assign(new Error("Startup time budget exhausted."), { code: "budget_exhausted" });
  return Math.max(1, deadlineMs - Date.now());
}

export async function gotoAgentRuntimeViaUi(page, options = {}) {
  const { baseUrl, agentName = DEFAULT_AGENT_NAME, signal } = options;
  if (!baseUrl) throw new Error("BASE_URL must explicitly identify the game deployment.");
  const deadlineMs = Math.min(options.deadlineMs ?? Infinity, Date.now() + (options.timeoutMs ?? 90_000));
  const timeout = () => remainingStartupMs(deadlineMs, signal);
  await page.goto(new URL(baseUrl).toString(), { waitUntil: "domcontentloaded", timeout: timeout() });
  await page.locator(PUBLIC_AGENT_STABLE_SELECTORS.agentMode).click({ timeout: timeout() });
  await page.locator(PUBLIC_AGENT_STABLE_SELECTORS.play).click({ timeout: timeout() });
  const agentNameInput = page.locator(PUBLIC_AGENT_STABLE_SELECTORS.agentName);
  await agentNameInput.fill(sanitizeAgentName(agentName), { timeout: timeout() });
  await agentNameInput.press("Enter", { timeout: timeout() });
  return await waitForRuntimeReady(page, { timeoutMs: timeout() });
}

export async function gotoAgentRuntimeViaUrl(page, options = {}) {
  const { baseUrl, agentName = DEFAULT_AGENT_NAME, extraSearchParams = {}, signal } = options;
  const deadlineMs = Math.min(options.deadlineMs ?? Infinity, Date.now() + (options.timeoutMs ?? 90_000));
  const timeout = () => remainingStartupMs(deadlineMs, signal);
  await page.goto(buildRuntimeUrl(baseUrl, { agentName, extraSearchParams }), {
    waitUntil: "domcontentloaded", timeout: timeout()
  });
  return await waitForRuntimeReady(page, { timeoutMs: timeout() });
}

export async function gotoAgentRuntime(page, options = {}) {
  if (!options.baseUrl) throw new Error("BASE_URL must explicitly identify the game deployment.");
  const deadlineMs = Math.min(options.deadlineMs ?? Infinity, Date.now() + (options.timeoutMs ?? 90_000));
  const abort = () => { void releaseInputs(page).catch(() => {}).finally(() => page.close().catch(() => {})); };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    remainingStartupMs(deadlineMs, options.signal);
    let state;
    try {
      state = await gotoAgentRuntimeViaUrl(page, { ...options, deadlineMs, timeoutMs: Math.max(1, deadlineMs - Date.now()) });
    } catch (error) {
      if (Date.now() >= deadlineMs || options.signal?.aborted) throw error;
      await releaseInputs(page).catch(() => {});
      state = await gotoAgentRuntimeViaUi(page, { ...options, deadlineMs, timeoutMs: Math.max(1, deadlineMs - Date.now()) });
    }
    validatePublicObservation(state);
    const api = await getAgentApiStatus(page);
    if (!api.agentApplyAction) throw compatibilityError("Required window.agent_apply_action is unavailable.");
    return state;
  } catch (error) {
    await releaseInputs(page).catch(() => {});
    if (error.code === "contract_mismatch") throw error;
    error.code = options.signal?.aborted ? "stopped"
      : Date.now() >= (options.deadlineMs ?? Infinity) ? "budget_exhausted" : "startup_failure";
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
  }
}

export function compatibilityError(message) {
  return Object.assign(new Error(`Public game compatibility error: ${message}`), { code: "contract_mismatch" });
}

export function validatePublicObservation(state) {
  if (state?.apiVersion !== PUBLIC_AGENT_API_VERSION || state?.contract !== PUBLIC_AGENT_CONTRACT) {
    throw compatibilityError(`Expected apiVersion=${PUBLIC_AGENT_API_VERSION} and contract=${PUBLIC_AGENT_CONTRACT}.`);
  }
  if (typeof state.gameplay?.alive !== "boolean") {
    throw compatibilityError("Required gameplay.alive must be a boolean.");
  }
  const perception = state.perception;
  if (!perception || !Array.isArray(perception.visibleTargets) || typeof perception.movementBlocked !== "boolean") {
    throw compatibilityError("Required perception.visibleTargets[] and perception.movementBlocked are missing or invalid. Deploy the coordinated visible-target game contract.");
  }
  if (perception.visibleTargets.some((target) => !target || typeof target.id !== "string"
    || !Number.isFinite(target.yawOffsetDeg) || !Number.isFinite(target.pitchOffsetDeg))) {
    throw compatibilityError("Every visible target requires a string id and finite yawOffsetDeg/pitchOffsetDeg.");
  }
  return state;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function sanitizeAction(action = {}) {
  return {
    moveX: clamp(action.moveX, -1, 1) ?? 0,
    moveZ: clamp(action.moveZ, -1, 1) ?? 0,
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

  try {
    await page.evaluate((payload) => {
      if (typeof window.agent_apply_action !== "function") throw new Error("Required window.agent_apply_action is unavailable.");
      window.agent_apply_action(payload);
    }, nextAction);
  } catch (error) {
    if (error.message.includes("window.agent_apply_action is unavailable")) throw compatibilityError(error.message);
    throw error;
  }
}

export async function releaseInputs(page) {
  await applyAction(page, { moveX: 0, moveZ: 0, lookYawDelta: 0, lookPitchDelta: 0, fire: false, reload: false, jump: false, crouch: false });
}

// Explicit deterministic stepping helper; never used by the normal real-time loop.
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

export async function clickPlayAgainIfVisible(page, { timeoutMs = 20_000 } = {}) {
  const button = page.locator(PUBLIC_AGENT_STABLE_SELECTORS.playAgain);
  const visible = await button.isVisible().catch(() => false);
  if (!visible) return false;

  await button.click({ timeout: Math.max(1, timeoutMs) });
  return true;
}

export async function ensureFreshRun(page, options = {}) {
  const { waitMs = 125, timeoutTicks = 80, signal } = options;
  const deadlineMs = Math.min(options.deadlineMs ?? Infinity,
    Date.now() + (options.timeoutMs ?? timeoutTicks * waitMs));
  try {
    await releaseInputs(page);
    for (;;) {
      if (signal?.aborted) throw Object.assign(new Error("Retry stopped."), { code: "stopped" });
      if (Date.now() >= deadlineMs) {
        throw Object.assign(new Error("Unable to recover to a fresh living run within the time budget."), {
          code: Date.now() >= (options.deadlineMs ?? Infinity) ? "budget_exhausted" : "startup_failure"
        });
      }
      const state = await readState(page);
      if (isRuntimeReady(state)) {
        validatePublicObservation(state);
        if (!isDead(state) && state.score?.current === 0) return state;
        if (isDead(state)) await clickPlayAgainIfVisible(page, { timeoutMs: deadlineMs - Date.now() });
      }
      await delay(Math.max(0, Math.min(waitMs, deadlineMs - Date.now())));
    }
  } catch (error) {
    if (signal?.aborted) error.code = "stopped";
    else if (Date.now() >= (options.deadlineMs ?? Infinity)) error.code = "budget_exhausted";
    throw error;
  } finally {
    await releaseInputs(page).catch(() => {});
  }
}

export {
  PUBLIC_AGENT_CANONICAL_HOST,
  PUBLIC_AGENT_NAME_MAX_LENGTH,
  PUBLIC_AGENT_STABLE_SELECTORS,
  PUBLIC_AGENT_SUPPORTED_GLOBALS
} from "./contract.mjs";
