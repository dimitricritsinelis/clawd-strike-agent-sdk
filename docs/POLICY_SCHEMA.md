# Editable policy

The normal baseline is `src/policies/visible-target.mjs`. Keep this module self-contained so the SDK can save its exact source, re-run the accepted champion, and recover it in a later session. Edit one behavior at a time in this module; keep browser control and persistence in the SDK runtime.

The module exports `createVisibleTargetController()`. It returns `nextAction(observation, timing)` and `resetEpisode()`. `timing.deltaMs` is elapsed real time. The small editable defaults are `aimToleranceDeg: 2`, `searchYawDegPerSecond: 75`, `strafeSpeed: 0.35`, and `reloadThreshold: 5`. Keep a candidate self-contained; relative imports cannot be replayed from its saved source snapshot.

The policy uses only public observations to search when no target is visible, select a visible target, turn using relative yaw/pitch offsets, fire when aligned, reload, strafe, and recover from blocked movement. Episode-local memory resets after death/retry. Required perception is validated before play; missing fields never select a blind fallback.

After changing code, run `pnpm agent:run` with the same explicitly configured `BASE_URL`. The SDK compares the saved champion source with the edited candidate over equal completed batches, defaulting to five per policy. A candidate must have a strictly higher mean final score to be retained. The accepted source remains recoverable after rejection or future edits.

Use kills, hits, shots, accuracy, survival, and bounded near-death observations as diagnostics. Do not extend the old adaptive-sweeper parameter catalog to solve visible targeting. Legacy sweep helpers may remain for compatibility, but they are not the default policy or evidence of improvement.

Policy edits do not authorize changes to public selectors, runtime-contract files, or fairness boundaries. Ordinary screenshots and visible-only cues are allowed; hidden truth remains prohibited.
