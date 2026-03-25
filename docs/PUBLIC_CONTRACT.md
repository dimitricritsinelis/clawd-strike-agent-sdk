# PUBLIC_CONTRACT.md

Authoritative source: root `skills.md`, which mirrors the game-side `/skills.md` contract.

This file is the operational reference for SDK users.

## Versioning

| Field | Expected value |
| --- | --- |
| Runtime `apiVersion` | `1` |
| Runtime `contract` | `public-agent-v1` |
| Workflow contract | `agentic-gameplay-v1` |
| Canonical host | `https://clawd-strike.vercel.app/` |

If either runtime version value changes, stop and report a contract mismatch before continuing.

## Allowed observations

Allowed public observations include:

- `mode`
- `runtimeReady`
- `gameplay.alive`
- `gameplay.gameOverVisible`
- `health`
- `ammo.mag`
- `ammo.reserve`
- `ammo.reloading`
- `score.current`
- `score.best`
- `score.lastRun`
- `sharedChampion`
- `lastRunSummary`
- optional `feedback.recentEvents`

## Allowed actions

Supported action payload:

```js
{
  moveX?: number,
  moveZ?: number,
  lookYawDelta?: number,
  lookPitchDelta?: number,
  jump?: boolean,
  fire?: boolean,
  reload?: boolean,
  crouch?: boolean
}
```

Use only `window.agent_apply_action(action)` to write actions.

## Stable selectors

| Purpose | Selector |
| --- | --- |
| Agent mode button | `[data-testid="agent-mode"]` |
| Enter Agent mode button | `[data-testid="play"]` |
| Agent name input | `[data-testid="agent-name"]` |
| Retry button | `[data-testid="play-again"]` |

## Stable runtime entrypoints

| Purpose | Global |
| --- | --- |
| Primary state reader | `window.agent_observe()` |
| Compatibility state reader | `window.render_game_to_text()` |
| Action writer | `window.agent_apply_action(action)` |
| Deterministic stepping fallback | `window.advanceTime(ms)` |

## Safe bootstrap

Preferred order:

1. try the fast-path URL with `?autostart=agent&name=...`
2. if that fails, fall back to the documented UI selectors
3. wait for `mode === "runtime"` and `runtimeReady === true`
4. begin the gameplay loop

## Fairness boundary

The public surface does **not** expose:

- coordinates
- map zones
- landmark ids
- enemy positions
- routes
- seeds
- debug or bounds data
- hidden line-of-sight truth

Do not infer or claim access to any of those surfaces.

## Public gameplay facts

These facts are safe to use because they are public product behavior:

- gameplay is wave-based survival/combat
- kill value scales by wave
- headshot bonus equals current kill value
- each new wave restores full health to `100`
- each new wave restores full ammo to `30/120`
- hunt pressure ramps after `10s` and is full by `30s`

## Retry contract

When dead:

1. record `score.lastRun`
2. record `lastRunSummary`
3. wait for `[data-testid="play-again"]`
4. click retry
5. wait until state is runtime-ready and alive again
6. confirm the new run restarts from:
   - wave `1`
   - full health
   - fresh ammo
   - `score.current === 0`

## Hidden-tab guidance

- visible tabs can run around `6-10Hz`
- hidden or minimized tabs should slow down to around `2Hz`
- when hidden, prefer coarse stepping such as `await window.advanceTime(500)`

## SDK rule

The SDK may only wrap the public contract. It may not widen the contract or add hidden truth.
