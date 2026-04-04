# Clawd Strike Agent SDK

Starter kit for browser agents that must bootstrap from public context only, enter Agent Mode, play repeated attempts, learn between attempts, and retry without widening the fairness boundary.

## Quickstart

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm agent:run
```

If you want the individual steps instead of the single-command flow:

```bash
pnpm contract:check
pnpm smoke:no-context
pnpm agent:baseline
pnpm agent:learn
```

This repo is intentionally a toolkit repo, not a polished published package. Repo-only maintainer tooling lives under `devtools/`, and the supported user path stays centered on the stable commands below.

## Stable command contract

| Command | Purpose | Main outputs |
| --- | --- | --- |
| `pnpm contract:check` | Validate command, file, skills, and runtime-contract drift | Console report |
| `pnpm smoke:no-context` | Prove a blank agent can launch, observe, die, and retry on the public surface | `output/no-context-smoke/<timestamp>/` |
| `pnpm agent:baseline` | Run one baseline attempt with the default policy | `output/baseline/` |
| `pnpm agent:learn` | Run baseline -> compare -> promote/reject -> retry with durable disk artifacts | `output/self-improving-runner/` |
| `pnpm agent:run` | Run the full post-install sequence from a clean managed output state and fail loudly if the benchmark target is not met | baseline + learning outputs |

Maintainer-only automation lives under `devtools/`. For repo-only iteration helpers, see [devtools/docs/MAINTAINER_TESTING.md](/Users/dimitri2/Desktop/clawd-strike-agent-sdk/devtools/docs/MAINTAINER_TESTING.md).

## Required reading order

Inside this repo, read files in this order:

1. `AGENTS.md` or `CLAUDE.md`
2. `REPO_BOUNDARY.md`
3. `docs/PUBLIC_CONTRACT.md`
4. `MEMORY.md`
5. `SELF_LEARNING.md`
6. `docs/OUTPUTS.md`
7. `docs/POLICY_SCHEMA.md`
8. `docs/TROUBLESHOOTING.md`

`AGENTS.md` and `CLAUDE.md` are intentionally identical.

## Learning phases

The default learner is explicitly phase-aware:

1. `bootstrap_hit`
2. `bootstrap_kill`
3. `stabilize_score`

Before the first hit, the SDK optimizes for acquisition, not survival. Before the first kill, it optimizes for conversion, not cosmetic scoreless longevity. `baselineMet` records whether a run achieved at least `1` kill within `5` completed attempts. The current starter should be treated as an evolving baseline, not a proven benchmark winner, until repeated benchmark runs pass.

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
- `candidateScreenDeaths`
- `bootstrapCatalogSize`
- `bootstrapConfirmCount`
- `bootstrapRescreenThreshold`

The resolved config is always written to `output/self-improving-runner/resolved-run-config.json` before learning starts.

Default contact-first run profile:

- `stepMs: 125`
- `baselineDeaths: 5`
- `candidateScreenDeaths: 2`
- `candidateDeaths: 6`
- `bootstrapCatalogSize: 6`
- `bootstrapConfirmCount: 2`
- `attemptBudget: 54`
- `stagnationLimit: 10`

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

`pnpm agent:run` also treats a benchmark miss as a failure, even if the artifact contract is satisfied.

Candidate summary ids are session-scoped and unique across repeated runs. Existing summaries are never overwritten because candidate summaries are written with exclusive create semantics.

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

The default controller is expected to use:

- `lookYawDelta`
- `lookPitchDelta`
- `feedback.recentEvents` when present

If `recentEvents` is missing, the controller must degrade gracefully to public-state-only behavior.

## Zero-hit escalation rule

If the first 5-attempt batch is completely hitless:

- record the failure honestly
- keep the artifacts
- stop pretending config-only survival gains are learning
- escalate to bounded policy-level acquisition changes in `src/policies/**`

Do not edit runtime wrappers or fairness-boundary files unless a human explicitly asks for that level of change.

## Bootstrap catalog

The default learner does not rely only on tiny mutations around one seed.

In contact bootstrap phases it screens a small catalog of public-safe opening styles, confirms the best 1 to 2 candidates on fuller batches, and only then mutates around whichever policy actually produced contact evidence.

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
- `devtools/`
  - maintainer-only automation, scripts, and workflow docs
- `examples/`
  - stable public workflows
- `scripts/`
  - stable repo validation helpers
- `src/policies/`
  - controller implementation and normalization
- `src/learn/`
  - comparison, mutation, storage, and memory-doc helpers
- `src/runtime/`
  - browser/runtime wrappers that stay contract-bound

## Product stance

This SDK is meant to help a public-only agent reach real combat acquisition, persist its learning honestly, and keep improving without becoming an omniscient bot.

If packaging becomes important later, add a strict publish boundary with `files` and `exports` in `package.json` and keep `examples/`, `scripts/`, and `test/` out of the published artifact.
