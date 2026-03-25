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

## Headed vs headless issues

### The game is visible but the agent never starts

Check:

- `BASE_URL` points at a live Clawd Strike deployment
- `[data-testid="agent-mode"]`, `[data-testid="play"]`, and `[data-testid="agent-name"]` still exist
- the agent name is valid and at most `15` characters
- the runtime eventually reports `mode === "runtime"` and `runtimeReady === true`

### The tab is hidden and progress stalls

Use coarse stepping:

```js
await window.advanceTime(500);
```

Do not spam tiny hidden-tab frame steps.

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

## The agent never gets a kill

Try this order:

1. increase `ATTEMPT_BUDGET`
2. slightly widen or narrow `strafeMagnitude`
3. shorten `sweepPeriodTicks`
4. increase `panicTurnDeg`
5. inspect `episodes.jsonl` and `candidate-summaries/*.json` before editing code

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
