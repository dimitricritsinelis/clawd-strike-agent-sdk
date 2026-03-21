import {
  PUBLIC_AGENT_CANONICAL_HOST,
  advance,
  applyAction,
  clickPlayAgainIfVisible,
  gotoAgentRuntime,
  launchBrowser,
  readState,
  waitForRespawn
} from "../src/index.mjs";
import { createAdaptiveSweeperController, DEFAULT_ADAPTIVE_SWEEPER_POLICY } from "../src/policies/adaptive-sweeper.mjs";

const BASE_URL = new URL(process.env.BASE_URL ?? PUBLIC_AGENT_CANONICAL_HOST).toString();
const HEADLESS = process.env.HEADLESS !== "false";
const MAX_STEPS = Math.max(1, Number(process.env.MAX_STEPS ?? 400));
const STEP_MS = Math.max(100, Number(process.env.STEP_MS ?? 250));

const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY);
const { browser, context, page } = await launchBrowser({ headless: HEADLESS });

try {
  await gotoAgentRuntime(page, { baseUrl: BASE_URL, agentName: "StarterBaseline" });

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const state = await readState(page);

    if (state.gameplay?.alive === false || state.gameplay?.gameOverVisible === true) {
      const clicked = await clickPlayAgainIfVisible(page);
      if (clicked) {
        controller.resetEpisode();
        await waitForRespawn(page);
      } else {
        await advance(page, STEP_MS);
      }
      continue;
    }

    const action = controller.nextAction(state);
    await applyAction(page, action);
    await advance(page, STEP_MS);
  }

  const finalState = await readState(page);
  console.log(JSON.stringify({
    finalScore: finalState.score?.current ?? null,
    best: finalState.score?.best ?? null,
    lastRun: finalState.score?.lastRun ?? null
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
