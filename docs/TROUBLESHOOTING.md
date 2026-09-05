# Troubleshooting

## Setup and startup

Use Node 20+ and the repository's pnpm version. Install dependencies with `pnpm install`, then run `pnpm exec playwright install --with-deps chromium`. Set `BASE_URL` explicitly to the configured deployment or an isolated server you own. The SDK never assumes an existing developer server is yours.

Run `pnpm ci:check` for local checks and `pnpm smoke:no-context` for public startup, completed death, and retry. A local contract check does not establish live game compatibility. `node --test test/browser.integration.mjs` runs the shared adapter in headed and headless browsers against an isolated synthetic contract fixture; headed mode requires a display. Passing it demonstrates SDK mechanics, not real game performance.

`HEADLESS=false pnpm smoke:no-context` shows the same adapter and controller used headlessly. If Chromium cannot launch, check the browser installation and host display requirements. Browser startup failure is distinct from a completed gameplay attempt.

## Compatibility error

The game must expose API version `1`, `public-agent-v1`, documented state/action globals, and the coordinated `perception.visibleTargets` plus boolean `perception.movementBlocked`. A visible target has a string ID and finite yaw/pitch offsets. Missing perception is a contract mismatch, not a request to use blind aiming or private globals.

Compare the configured game's `/skills.md` with the SDK's required contract. The canonical file fetched on 2026-09-05 still lacks `perception`, `visibleTargets`, and `movementBlocked`; mirroring awaits the coordinated canonical update. If the game API is unavailable, report integration verification as blocked and preserve local verification results.

## Timeout or budget stop

The default episode and smoke cap is approximately five minutes (`2400 × 125ms`). `TIME_BUDGET_MINUTES` can end a session sooner. Inspect the recorded stop reason before changing limits. A timeout is not death; a partial attempt does not count as completed and cannot promote a candidate. Valid earlier results remain on disk.

The game advances itself. Do not call `advanceTime()` to accelerate runs or work around a stalled hidden tab. The SDK releases held movement/buttons before stopping or retrying. A retry that never becomes ready is a startup/retry failure.

## No kills

Inspect `episodes.jsonl` and candidate summaries after five completed baseline attempts. Check visible-target acquisition, aim offsets/fire alignment, ammo/reload behavior, and blocked-movement recovery in the bounded near-death history. Form a hypothesis and change one policy behavior before spending a larger budget. Do not report survival-only behavior as successful combat learning.

## Saved learning and rejected edits

Reuse the same `OUTPUT_DIR`. `champion-policy.json` preserves accepted source; `episodes.jsonl` appends results; unique candidate summaries preserve historical comparisons. Browser storage and `USER_DATA_DIR` are not the durable policy or best-score record. Do not delete learning output to repair startup.

The `.run.lock` file prevents concurrent writers to an output directory. After a crash, verify that its recorded process has stopped before removing only that lock. Preserve episode and policy files.

A rejected edit does not replace the saved champion. Inspect the latest candidate summary for champion/candidate scores, validity, and decision evidence. Ties, unequal batches, incomplete evaluations, and invalid runs cannot promote. A session with too little budget for both batches preserves results but cannot establish improvement.

## Local contract check failures

Check exact filename case, especially `docs/TROUBLESHOOTING.md`, and remove only confirmed accidental shadow files. `AGENTS.md` and `CLAUDE.md` must stay consistent. Do not weaken the contract checker or validation to make a failing run appear successful.
