# Clawd Strike Agent SDK

Starter kit for browser agents that must bootstrap from public context only, enter Agent Mode, play repeated attempts, learn between attempts, and retry without widening the fairness boundary.

## Quickstart

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm contract:check
pnpm smoke:no-context
pnpm agent:baseline
pnpm agent:learn
```

## Stable command contract

| Command | Purpose | Main outputs |
| --- | --- | --- |
| `pnpm contract:check` | Validate command, file, skills, and runtime-contract drift | Console report |
| `pnpm smoke:no-context` | Prove a blank agent can launch, observe, die, and retry on the public surface | `output/no-context-smoke/<timestamp>/` |
| `pnpm agent:baseline` | Run one baseline attempt with the default policy | `output/baseline/` |
| `pnpm agent:learn` | Run baseline -> compare -> promote/reject -> retry with durable disk artifacts | `output/self-improving-runner/` |

## Required reading order

Inside this repo, read files in this order:

1. `AGENTS.md` or `CLAUDE.md`
2. `docs/PUBLIC_CONTRACT.md`
3. `MEMORY.md`
4. `SELF_LEARNING.md`
5. `docs/OUTPUTS.md`
6. `docs/POLICY_SCHEMA.md`
7. `docs/TROUBLESHOOTING.md`

`AGENTS.md` and `CLAUDE.md` are intentionally identical.

## Learning phases

The default learner is stage-aware:

1. bootstrap
2. baseline
3. hit bootstrap
4. kill bootstrap
5. score optimization

Before the first hit, the SDK optimizes for acquisition, not survival. Before the first kill, it optimizes for conversion, not cosmetic scoreless longevity.

## Run config

Editable config lives in `config/learning.config.json`.

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

The resolved config is always written to `output/self-improving-runner/resolved-run-config.json` before learning starts.

## Durable outputs

`pnpm agent:learn` must write:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`

Supporting artifacts:

- `output/self-improving-runner/semantic-memory.json`
- `output/self-improving-runner/hall-of-fame.json`
- `output/self-improving-runner/scoreboard.json`
- `MEMORY.md`
- `SELF_LEARNING.md`

If the required four learning artifacts are missing, the run is not durable self-improvement.

Candidate summary ids are monotonic across sessions. Existing summaries on disk are scanned before allocating the next id, and old summaries are never overwritten.

## Fairness boundary

Use only the public contract:

- public selectors
- public globals
- public state
- public retry flow
- durable artifacts written by this SDK in your workspace

Do **not** use:

- coordinates
- enemy positions
- routes
- seeds
- hidden debug truth
- screenshots, OCR, or pixel aiming

`lookPitchDelta` is public and allowed. Public feedback events such as `feedback.recentEvents` are allowed when present.

## Zero-hit escalation rule

If the first 5-attempt batch is completely hitless:

- record the failure honestly
- keep the artifacts
- stop pretending config-only survival gains are learning
- escalate to bounded policy-level acquisition changes in `src/policies/**`

Do not edit runtime wrappers or fairness-boundary files unless a human explicitly asks for that level of change.

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

## Repo map

- `skills.md`
  - SDK mirror of the canonical game-side contract
- `AGENTS.md`, `CLAUDE.md`
  - instructions for contextless agents
- `config/`
  - safe learning and policy defaults
- `docs/`
  - contract, outputs, schema, troubleshooting, and optional tuning guides
- `examples/`
  - smoke, baseline, and self-improving entrypoints
- `src/policies/`
  - controller implementation and normalization
- `src/learn/`
  - comparison, mutation, storage, and memory-doc helpers
- `src/runtime/`
  - browser/runtime wrappers that stay contract-bound

## Product stance

This SDK is meant to help a public-only agent reach real combat acquisition, persist its learning honestly, and keep improving without becoming an omniscient bot.
