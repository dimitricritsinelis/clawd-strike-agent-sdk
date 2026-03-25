# Clawd Strike Agent SDK

Starter kit for browser agents that must bootstrap from public context only, enter Agent Mode, play repeated attempts, learn between attempts, and retry.

The default controller is intentionally simple. It is designed to get a contextless agent from zero to a real learning loop without exposing hidden game truth or becoming obviously overpowered.

## Quickstart

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm contract:check
pnpm smoke:no-context
pnpm agent:baseline
pnpm agent:learn
```

## What this repo guarantees

- a fixed reading order for contextless agents
- stable starter commands:
  - `pnpm smoke:no-context`
  - `pnpm agent:baseline`
  - `pnpm agent:learn`
- disk-backed outputs for cross-attempt learning
- a bounded, data-first tuning surface
- a strict fairness boundary around public state only

## Required reading order

1. `AGENTS.md` or `CLAUDE.md`
2. `docs/PUBLIC_CONTRACT.md`
3. `MEMORY.md`
4. `SELF_LEARNING.md`
5. `docs/OUTPUTS.md`
6. `docs/POLICY_SCHEMA.md`
7. `docs/TROUBLESHOOTING.md`

`AGENTS.md` and `CLAUDE.md` are intentionally identical.

## Command matrix

| Command | Purpose | Main outputs |
| --- | --- | --- |
| `pnpm contract:check` | Validate that the repo surface matches the documented command/file/output contract | Console report |
| `pnpm smoke:no-context` | Prove a blank agent can launch, observe, die, and retry using only the public surface | `output/no-context-smoke/<timestamp>/` |
| `pnpm agent:baseline` | Run one baseline attempt with the default policy and record the result | `output/baseline/` |
| `pnpm agent:learn` | Run the repeat -> summarize -> improve -> retry loop with persistent disk artifacts | `output/self-improving-runner/` |

## Run configuration

Default config lives in `config/learning.config.json`.

Required fields:

- `agentName`
- `modelProvider`
- `modelName`
- `headless`
- `attemptBudget` or `timeBudgetMinutes`
- `learningEnabled`

Optional fields:

- `userNotes`
- `watchMode`

Environment variables override config file values. The resolved config is written to `output/self-improving-runner/resolved-run-config.json`.

### Example run

```bash
HEADLESS=false \
AGENT_NAME=ClawdLearner \
MODEL_PROVIDER=metadata-only \
MODEL_NAME=adaptive-sweeper \
ATTEMPT_BUDGET=30 \
TIME_BUDGET_MINUTES=15 \
pnpm agent:learn
```

In this starter, `modelProvider` and `modelName` are metadata fields. They exist so agents and users can record what higher-level planner or host model was used around the public controller loop.

## Safe edit surface

Safe by default:

- `MEMORY.md`
- `SELF_LEARNING.md`
- `config/*.json`
- `output/**`

Allowed with caution:

- `src/policies/**`

Locked by default:

- `src/runtime/**`
- `skills.md`
- `docs/PUBLIC_CONTRACT.md`
- `sdk.contract.json`
- `scripts/validate-sdk-contract.mjs`

## Durable learning outputs

Required learning artifacts:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`

Recommended supporting artifacts:

- `output/self-improving-runner/semantic-memory.json`
- `output/self-improving-runner/hall-of-fame.json`
- `output/self-improving-runner/scoreboard.json`
- `MEMORY.md`
- `SELF_LEARNING.md`

If those first four files do not exist after `pnpm agent:learn`, the run should not be described as durable self-improvement.

## Repo map

- `skills.md`
  - mirror of the canonical game contract
- `AGENTS.md`, `CLAUDE.md`
  - procedural instructions for contextless agents
- `MEMORY.md`
  - short working memory for the current session
- `SELF_LEARNING.md`
  - curated durable lessons
- `config/`
  - safe default tuning surface
- `docs/`
  - public contract, outputs, policy schema, troubleshooting
- `examples/`
  - runnable smoke, baseline, and learn entrypoints
- `src/runtime/`
  - stable browser/game interaction wrappers
- `src/policies/`
  - policy behavior modules
- `src/learn/`
  - comparison, mutation, storage, memory-doc helpers
- `src/utils/`
  - filesystem and RNG helpers
- `scripts/`
  - local validation for command/file/output drift

## Product stance

This SDK is meant to let an agent:

- get into the game
- learn quickly enough to plausibly reach at least one kill within five attempts
- keep improving across attempts
- still leave meaningful room for a user or stronger agent to steer the policy further

It is not meant to be an omniscient bot or a hidden-state exploit surface.

## Fairness boundary

Use only the public contract:

- public selectors
- public globals
- public state
- public retry flow

Do **not** use:

- coordinates
- enemy positions
- routes
- seeds
- hidden debug truth

The goal is learning from limited public feedback.

## CI stance

`pnpm contract:check` plus the included GitHub Action are the local SDK side of drift prevention. The game-side `/skills.md` is still the authoritative source of truth.
