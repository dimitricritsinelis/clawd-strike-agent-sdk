# Clawd Strike Agent SDK Instructions

## Mission

Use only the public Clawd Strike contract to enter Agent Mode, play repeated attempts, save results to disk, improve between attempts, and retry until a stop condition fires.

## Do this first

1. Read `README.md`.
2. Read `docs/PUBLIC_CONTRACT.md`.
3. Read `MEMORY.md`.
4. Read `SELF_LEARNING.md`.
5. Read `docs/OUTPUTS.md`.
6. Read `docs/POLICY_SCHEMA.md`.
7. Read `docs/TROUBLESHOOTING.md`.
8. Run `pnpm contract:check`.

## Stable run order

1. `pnpm smoke:no-context`
2. `pnpm agent:baseline`
3. `pnpm agent:learn`

Do not skip the smoke command on a fresh setup.

## Phase order

1. bootstrap
2. baseline
3. hit bootstrap
4. kill bootstrap
5. score optimization

## Required behavior

- save a run config before play starts
- launch Agent Mode through the public flow only
- run one baseline attempt before tuning
- keep the live gameplay loop simple:
  - observe
  - choose
  - apply
  - continue until death
- do learning between attempts, not every tick
- persist learning on disk

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

## Learning rules

- change config and policy parameters first
- compare candidates on batches, not single runs
- promote only on evidence
- use the stage-aware ladder:
  1. if champion has zero hits and zero kills:
     - more hit-positive episodes
     - more total hits
     - then kills, score, survival, accuracy
  2. if champion has hits but zero kills:
     - more kill-positive episodes
     - more total kills
     - then hits, score, survival, accuracy
  3. once baseline is met:
     - kills
     - score
     - survival
     - accuracy with comparable shot volume
- update `MEMORY.md` often
- curate `SELF_LEARNING.md` conservatively

## Common failure modes

- fresh browser profile resets local `best`
- fresh filesystem destroys durable learning
- case-only path drift passes locally on macOS and fails in CI
- missing selectors or globals mean contract drift
- missing output artifacts means the learning claim is invalid
- repeated no-promotion zero-hit batches usually mean acquisition failure, not success

## Escalation rule

- config and memory first
- if the first 5 completed attempts have zero hits, escalate to bounded acquisition changes in `src/policies/**`
- do **not** respond to a zero-hit batch by only raising the attempt budget
- runtime wrappers, public contract files, and fairness-boundary files stay locked unless a human explicitly asks for that level of change

## Stop conditions

Stop when any of these happens:

- attempt budget reached
- time budget reached
- user stops the run
- stagnation threshold hit
- learning disabled
- contract mismatch
- fatal runtime error

## Output contract

A valid learning run must write:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`
