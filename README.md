# Clawd Strike Agent SDK

Run a browser agent, save its results, edit one policy behavior, and compare it with the saved champion. The surrounding agent supplies reasoning and code edits. The SDK supplies browser control, a visible-target baseline, episode evidence, and score-based evaluation. No embedded LLM, API key, or learning service is required.

## Start

Read the game's `/skills.md` for its public contract, then run:

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
export BASE_URL='https://your-configured-test-deployment.example/'
pnpm agent:run
```

Replace the example URL with the explicitly configured test deployment or an isolated server you own. The SDK does not start a game server. Never assume an existing developer server belongs to this run. `BASE_URL` is required unless `baseUrl` is explicitly set in `config/learning.config.json`.

`pnpm agent:run` resumes the accepted policy and appends history. The first invocation plays the baseline. After you edit `src/policies/visible-target.mjs`, the next invocation replays the saved champion and evaluates the edited candidate. Keep `output/self-improving-runner/` between sessions. No additional documentation chain is required for startup.

The coordinated game contract must expose `perception.visibleTargets` and `perception.movementBlocked`. Missing perception stops play with a compatibility error. The canonical game `/skills.md` fetched on 2026-09-05 still lacks these fields. The checked-in `skills.md` documents the required SDK contract; mirroring remains pending the coordinated canonical update.

## Commands and budgets

| Command | Purpose |
| --- | --- |
| `pnpm agent:run` | Normal entry point: resume, play, and evaluate an edited policy |
| `pnpm agent:learn` | Run the same gameplay/evaluation workflow directly |
| `pnpm agent:baseline` | Record a baseline batch (default five attempts) |
| `pnpm smoke:no-context` | Check public startup, completed death, and retry |
| `pnpm contract:check` | Check local files, commands, and contract consistency |
| `pnpm ci:check` | Run local contract, unit, and syntax checks |

Use `HEADLESS=false pnpm agent:run` to watch the same controller and browser adapter. `BATCH_EPISODES` sets both comparison batch sizes (default `5`); the default session allows `10` completed attempts. Set `ATTEMPT_BUDGET` and `TIME_BUDGET_MINUTES` to bound a session. Attempts count completed deaths only. A timeout or interrupted episode is not a completed attempt and cannot support promotion. Valid earlier results remain saved.

`BASELINE_DEATHS=1 pnpm agent:baseline` retains the one-attempt baseline option. `BATCH_EPISODES` controls normal comparison batches independently.

The normal loop observes and applies actions about every `125ms` using elapsed real time. The game advances itself; this loop never calls `advanceTime()`. Movement and held buttons persist until replaced, while look deltas apply per call. The adapter explicitly releases held inputs before retry, shutdown, or other execution-state changes. Headless mode uses the same timing; hidden-tab throttling is not compensated with simulated time.

The default episode and smoke limit is `2400 × 125ms`, approximately five minutes, rather than the former fifteen-second smoke window. Browser startup and retry have separate failure reporting.

## Improve one behavior at a time

1. Play a batch and inspect `episodes.jsonl` and the latest candidate summary.
2. Check whether the baseline got at least one kill in five completed attempts. If it did not, inspect acquisition evidence before spending a larger budget.
3. Change one behavior in `src/policies/visible-target.mjs`, such as aiming, reload timing, or blocked-movement recovery.
4. Run `pnpm agent:run` again. The SDK re-evaluates the saved champion under the same current conditions, then evaluates the candidate over an equal-sized completed batch, defaulting to five episodes each.
5. Retain only a strictly higher mean final score. Ties, unequal batches, incomplete evaluations, and invalid runs never promote. Repeat within the user's budget.

Kills, hits, shots, accuracy, and survival are diagnostics. The best individual score is stored separately from the mean used for promotion. Larger batches cannot win through larger raw totals. Re-evaluation reduces stale-evidence bias but is not a guarantee against random variation or game changes during a run. No individual attempt is promised to beat the last.

## Saved evidence

Under `output/self-improving-runner/`:

- `champion-policy.json`: accepted policy identity and recoverable code snapshot.
- `episodes.jsonl`: append-only results, including score, kills, hits, shots, survival, death cause when public, policy identity, and bounded observation/action history near death.
- `candidate-summaries/*.json`: unique, immutable evaluation evidence, policy snapshots, execution context, scores, and promotion decision.
- `scoreboard.json`: durable best-ever individual score.
- `resolved-run-config.json` and `latest-session-summary.json`: latest configuration, stop reason, comparison, and saved locations.

The browser's `score.best` is session-local and is not durable learning. Historical results describe their recorded URL, public profile/tuning identity, and settings; they do not demonstrate performance on a later game revision. First-run baseline evidence demonstrates gameplay only. Policy improvement requires a completed comparison that retains an edited candidate.

Separate observations from hypotheses when reviewing the death history. For example, a visible target and repeated large aim offsets are evidence; “aiming caused this death” is an inference requiring a targeted comparison. `MEMORY.md` and `SELF_LEARNING.md` are optional human/agent notes, not generated proof.

## Public boundary

Use public selectors, documented globals, ordinary screenshots, and visible-only target cues. Target IDs are stable within an episode; offsets describe visible, unoccluded aim points and have the same signs as `lookYawDelta` and `lookPitchDelta`. Reset target memory on retry.

Hidden coordinates, occluded enemies, routes, seeds, private debug truth, and validation internals remain prohibited. Missing perception is a contract mismatch; do not replace it with blind aiming or private globals.

For adapter verification against an isolated synthetic public-contract fixture, run `node --test test/browser.integration.mjs`. It exercises headed and headless browsers; headed mode needs a display. Fixture results demonstrate SDK mechanics, not game kills or policy improvement. Live gameplay still needs the configured game deployment and coordinated perception.

Optional references: [public contract](docs/PUBLIC_CONTRACT.md), [policy](docs/POLICY_SCHEMA.md), [outputs](docs/OUTPUTS.md), and [troubleshooting](docs/TROUBLESHOOTING.md).
