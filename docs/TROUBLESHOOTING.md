# TROUBLESHOOTING.md

## Install failures

### `pnpm install` fails

- verify Node `20+`
- verify `pnpm` is installed
- retry with:
  ```bash
  pnpm install --no-frozen-lockfile
  ```

### Playwright browser install fails

Run:

```bash
pnpm exec playwright install --with-deps chromium
```

If your host cannot install system dependencies, try a local Chromium install and rerun.

## Repo drift and path issues

### `pnpm contract:check` passes locally but CI fails on files

Case-only filename mismatches can appear to work on macOS and still fail in Linux CI.

Check:

- `docs/TROUBLESHOOTING.md` exists with that exact case
- `docs/troubleshooting.md` does not exist
- banned shadow files such as `README 2.md`, `package 2.json`, and `skills 2.md` are absent

Then rerun:

```bash
pnpm contract:check
```

## Browser launch issues

### Headless launch fails

Try:

```bash
HEADLESS=false pnpm smoke:no-context
```

### Persistent profile problems

If local `best` keeps resetting, make sure `USER_DATA_DIR` stays stable across runs.

Default:

- `.agent-profile/`

Do not use a fresh temporary browser context if you want browser-session persistence.

## Missing selectors or globals

### Public selectors changed

Run:

```bash
pnpm contract:check
```

Then compare the live surface with:

- `skills.md`
- `docs/PUBLIC_CONTRACT.md`
- `src/runtime/contract.mjs`

Do not guess private selectors.

### `agent_observe` and `render_game_to_text` are both missing

Treat this as a hard contract mismatch. Stop and report it.

### `agent_apply_action` is missing

Treat this as a hard contract mismatch. Stop and report it.

## Failed game start

If autostart fails, the starter already falls back to the documented UI flow.

Manual recovery:

1. open the canonical host
2. click `Agent`
3. click `Enter agent mode`
4. enter a valid name
5. press `Enter`

## Missing outputs

### `agent:learn` completes but required artifacts are missing

Check:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/`

If any are missing, treat the learning run as invalid.

### Local memory docs did not update

Check:

- `SAVE_MEMORY_DOCS=true`
- `MEMORY.md` and `SELF_LEARNING.md` are writable
- the workspace is not read-only

Memory-doc failures are supportive warnings. Required-output failures are fatal.

## The agent never gets a kill

Use this order.

1. Inspect whether the agent got **any hits** in the first 5 completed attempts.
2. If there were zero hits:
   - do **not** just raise `ATTEMPT_BUDGET`
   - inspect the bootstrap catalog results before mutating blindly
   - move to policy-level acquisition fixes in `src/policies/**`
   - verify low / mid / high pitch-band scanning is active
   - verify probe bursts and cooldowns are reducing spam
   - verify damage-driven micro-scan is visible in telemetry
   - verify `feedback.recentEvents` is consumed when present
3. If there were hits but zero kills:
   - extend engage hold
   - inspect engage burst length / cooldown
   - slow movement while firing
   - inspect reload timing and damage reacquisition timing
4. Only after that should you widen budgets or exploration scale.

Inspect these artifacts before editing code:

- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/candidate-summaries/*.json`
- `output/self-improving-runner/latest-session-summary.json`

Useful telemetry to inspect first:

- `timeToFirstHitS`
- `timeToFirstKillS`
- `controllerTelemetry.pitchBandVisits`
- `controllerTelemetry.modeTicks`
- `controllerTelemetry.recentEventCounts`
- `controllerTelemetry.damageReactionCount`

## Evaluation hangs

Increase:

- `MAX_STEPS_PER_EPISODE`

And inspect manually with:

```bash
HEADLESS=false pnpm agent:learn
```

## Console errors appear

The starter treats page and console errors as real failures because contract drift can make the learning signal meaningless.

Inspect:

- console output
- screenshots
- `skills.md`
- `docs/PUBLIC_CONTRACT.md`
- recent changes to the public runtime surface
