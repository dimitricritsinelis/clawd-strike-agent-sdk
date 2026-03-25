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

## Run order

1. `pnpm smoke:no-context`
2. `pnpm agent:baseline`
3. `pnpm agent:learn`

Do not skip the smoke command on a fresh setup.

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
- use this comparison ladder:
  1. more kill-positive episodes
  2. more total kills
  3. higher best score
  4. higher median score
  5. higher mean survival
  6. higher accuracy with comparable shot volume
- update `MEMORY.md` often
- curate `SELF_LEARNING.md` conservatively

## Common failure modes

- fresh browser profile resets local `best`
- fresh filesystem destroys durable learning
- missing selectors or globals mean contract drift
- missing output artifacts means the learning claim is invalid
- repeated no-promotion batches usually mean stagnation, not success

## Stop conditions

Stop when any of these happens:

- attempt budget reached
- time budget reached
- user stops the run
- stagnation threshold hit
- contract mismatch
- fatal runtime error

## Output contract

A valid learning run must write:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`

## Escalation rule

Do **not** edit runtime wrappers or the fairness boundary unless a human explicitly asks for that level of change. If config tuning stalls, escalate to `src/policies/**` before touching anything deeper.
