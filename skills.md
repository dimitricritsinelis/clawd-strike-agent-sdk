# Clawd Strike SDK gameplay contract

Companion SDK: `https://github.com/dimitricritsinelis/clawd-strike-agent-sdk`
Public runtime contract: `public-agent-v1`, API version `1`
Workflow contract: `agentic-gameplay-v1`
Canonical game contract: `https://clawd-strike.vercel.app/skills.md`

This is the SDK compatibility guide for the coordinated visible-perception contract. The canonical `/skills.md` fetched on 2026-09-05 still lacks `perception`, `visibleTargets`, and `movementBlocked`. This file is therefore not a canonical mirror. Once the coordinated canonical update is available, mirror it here and check the SDK guidance for drift. Until then, a deployment without the required perception is incompatible.

## Start and resume

From the companion SDK repository:

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
export BASE_URL='https://your-configured-test-deployment.example/'
pnpm agent:run
```

Replace the URL with the configured deployment or an isolated server you own. Never assume an existing developer server is yours. No mandatory multi-document reading chain is required; the README contains the quickstart and optional references.

`pnpm agent:run` resumes saved policy state and appends episode history. `pnpm agent:learn` runs the same gameplay/evaluation workflow directly. `pnpm agent:baseline` records a baseline batch, defaulting to five completed attempts; `BASELINE_DEATHS=1` selects one attempt. `pnpm smoke:no-context` checks startup, death, and retry. `pnpm contract:check` checks the local SDK contract; it does not prove live game compatibility.

The surrounding agent reasons about results and edits `src/policies/visible-target.mjs`. No embedded LLM calls, API key, reinforcement-learning service, or additional orchestration framework is needed.

## Public browser contract

Enter Agent Mode through `?autostart=agent&name=AutoAgent` on the configured base URL, or use:

1. `[data-testid="agent-mode"]`
2. `[data-testid="play"]`
3. `[data-testid="agent-name"]`, then press Enter.

Names contain 1–15 ASCII letters, numbers, spaces, `-`, `_`, `.`, or `'`. A blocked or invalid name can prevent startup.

Read public state with `window.agent_observe()`, or the compatibility reader `window.render_game_to_text()`. The readers return JSON. Apply actions with `window.agent_apply_action(action)`. Do not access private globals.

Runtime state must identify `apiVersion: 1`, `contract: "public-agent-v1"`, `mode: "runtime"`, and `runtimeReady: true` before play. Relevant public fields include:

```js
{
  gameplay: { alive: true, gameOverVisible: false },
  health: 100,
  ammo: { mag: 30, reserve: 120, reloading: false },
  score: { current: 0, best: 0, lastRun: null },
  perception: {
    visibleTargets: [
      { id: "target-id", yawOffsetDeg: 3, pitchOffsetDeg: -1 }
    ],
    movementBlocked: false
  },
  lastRunSummary: null,
  feedback: { recentEvents: [] }
}
```

This is a field example, not a complete schema or guaranteed spawn state. `lastRunSummary` supplies final score, kills, shots hit/fired, accuracy, survival, and death cause when available. `feedback` remains optional. Public profile/tuning identity is recorded when the game exposes it; absent identity must not be invented.

`perception.visibleTargets` and boolean `perception.movementBlocked` are required during gameplay. Targets have string IDs stable within the episode and finite relative yaw/pitch offsets. They represent visible, unoccluded aim points. Offset signs match `lookYawDelta` and `lookPitchDelta`. Missing or malformed perception is a compatibility error, never a reason to fall back to blind aiming or debug truth.

Allowed action fields:

```js
{
  moveX: 0,           // -1..1
  moveZ: 0,           // -1..1
  lookYawDelta: 0,    // degrees per call
  lookPitchDelta: 0,  // degrees per call
  jump: false,
  fire: false,
  reload: false,
  crouch: false
}
```

Movement and held buttons remain active until replaced. Look deltas apply per call. Explicitly send zero movement and false button values before stopping, retrying, pausing, or changing execution state. Do not rely on an empty action to release controls.

Observe, choose, and apply at about `125ms` intervals using elapsed real time, with the same controller and browser adapter in headed and headless modes. The game advances itself. Do not call `advanceTime()` in this normal loop or use it to compensate for hidden-tab throttling.

## Death, retry, and budgets

Death is `gameplay.alive === false` or `gameplay.gameOverVisible === true`. Record public final results, release controls, wait for `[data-testid="play-again"]`, and click it. Wait for runtime-ready, alive state before resuming; reset episode-local target and movement memory.

The default episode/smoke duration allows roughly five minutes (`2400 × 125ms`). Startup failure, contract mismatch, timeout, completed death, and interruption are distinct outcomes. Only completed valid death results count toward evaluation and completed-attempt budgets. Stop within the configured attempt/time budget, preserve earlier completed results, and release inputs.

## Improve with evidence

1. Play a batch. Verify at least one kill within five completed baseline attempts before claiming useful baseline gameplay.
2. Inspect scores and bounded public observation/action history near death.
3. Form a hypothesis and change one policy behavior.
4. Re-evaluate the saved champion and edited candidate under the same current conditions, with equal completed batches, defaulting to five each.
5. Promote only a strictly higher mean final score. Reject ties, incomplete evaluations, invalid runs, and unequal batch sizes.
6. Retain or reject, then repeat within the user's budget. Later invocations resume the saved accepted policy.

Keep best-ever individual score separately. Hits, kills, accuracy, and survival are diagnostics. Record base URL, public profile/tuning identity when available, policy identity and source, and relevant execution settings. An old recording is not evidence of success on a different revision. Observations are evidence; inferred failure causes require further evaluation. Every individual attempt need not improve.

Durable paths:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`
- `output/self-improving-runner/scoreboard.json`

Keep accepted policy code recoverable, append episodes, and create unique candidate evidence without overwriting history. Browser `score.best`, sessionStorage, or a profile alone does not satisfy persistence. A completed baseline demonstrates gameplay; an accepted edit supported by a valid comparison demonstrates policy improvement.

## Fairness boundary

Ordinary screenshots, public UI, documented selectors/globals, public observations, and visible-only targeting cues are allowed. Hidden coordinates, occluded enemies, routes, seeds, debug truth, and validation internals remain prohibited. Do not inspect hidden world state or derive targeting from private globals.
