# MEMORY.md

Short working memory for the current agent/session. This file is safe to overwrite often.

<!-- MEMORY_GENERATED:BEGIN -->
## Current best policy summary
- id: `learn-20260326t025040089z-822eb8da-seed`
- label: `seed`
- learning phase: `bootstrap_hit`
- hit-positive episodes: `0`
- kill-positive episodes: `0`
- total hits: `0`
- total kills: `0`
- best score: `0`
- mean survival: `5.92`
- baseline milestone: `still below 1 kill within 5 attempts`

## Active hypothesis
- Bootstrap the first hit with pitch-band scanning, probe bursts, and damage-driven micro-scans.

## Most recent useful lesson
- No lesson has been promoted yet.

## Current run config
- agentName: `ClawdLearner`
- modelProvider: `metadata-only`
- modelName: `adaptive-sweeper`
- headless: `true`
- attemptBudget: `54`
- timeBudgetMinutes: `20`
- learningEnabled: `true`

## Current experiment queue
- Widen the pitch-band ladder or slow its cadence so low/mid/high bands all get visited early.
- Use stricter probe bursts instead of longer fire spam during acquisition.
- Increase damage micro-scan width or hold length so recent damage causes a local reacquire instead of a long drift.
- Bias movement toward strafe over forward motion when recentEvents or damage cues appear.

## Known constraints / known bugs
- Survival-only zero-contact behavior is not a valid promotion target before first hit or first kill.
- Durable learning requires both a persistent browser profile and a persistent workspace.
- Only the public runtime contract may be used.
- Runtime wrappers and fairness-boundary files stay locked by default.
<!-- MEMORY_GENERATED:END -->

## Manual notes

- Add temporary user steering or session notes here.
- Keep this section short.
