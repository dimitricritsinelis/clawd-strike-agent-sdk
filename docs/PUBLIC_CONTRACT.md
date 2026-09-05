# Public contract reference

Use the configured game's `/skills.md` as the canonical game contract. The canonical file fetched on 2026-09-05 still lacks the required `perception`, `visibleTargets`, and `movementBlocked` fields. Root `skills.md` documents the required coordinated SDK contract; mirroring awaits the canonical update.

Expected runtime identity: `apiVersion: 1`, `contract: "public-agent-v1"`. Stop on a mismatch. The normal SDK additionally requires:

```js
perception: {
  visibleTargets: [
    { id: "stable-within-episode", yawOffsetDeg: 3, pitchOffsetDeg: -1 }
  ],
  movementBlocked: false
}
```

Visible targets are unoccluded aim points. IDs are stable within an episode. Offset signs match `lookYawDelta` and `lookPitchDelta`. Offsets must be finite numbers. Missing or malformed perception is a compatibility error. Optional `feedback.recentEvents` is public; its absence is not an error.

| Purpose | Public entry point |
| --- | --- |
| Primary observation | `window.agent_observe()` |
| Compatibility observation | `window.render_game_to_text()` |
| Action | `window.agent_apply_action(action)` |
| Agent menu | `[data-testid="agent-mode"]` |
| Enter Agent Mode | `[data-testid="play"]` |
| Name | `[data-testid="agent-name"]` |
| Retry | `[data-testid="play-again"]` |

Use a configured `BASE_URL`. The public fast path adds `?autostart=agent&name=...`; the documented menu flow is the fallback. Wait for runtime-ready and alive state before controlling play.

Actions contain `moveX`, `moveZ` in `-1..1`, `lookYawDelta`, `lookPitchDelta` in degrees per call, and boolean `jump`, `fire`, `reload`, `crouch`. Movement and held buttons persist until replaced. Explicitly release all held inputs before retry, pause, shutdown, and other execution-state changes.

The same headed/headless adapter observes and acts at about 8 Hz using elapsed real time. The normal loop never calls `advanceTime()` because the game already advances. Do not compensate for hidden-tab throttling with simulated time.

At death (`gameplay.alive === false` or `gameplay.gameOverVisible === true`), record `score.lastRun` and `lastRunSummary`, release inputs, then use the retry button when available. Resume only after the public runtime reports alive and ready; reset all episode-local policy memory. Startup failure, compatibility error, episode timeout, and completed death are separate outcomes.

Ordinary screenshots and visible-only target cues are allowed. Hidden coordinates, occluded enemies, routes, seeds, private debug truth, and validation internals remain prohibited. The SDK may wrap the public contract but may not widen it.
