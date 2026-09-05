# Saved outputs

Normal runs preserve the output directory. Keep it between sessions; browser-session `score.best` is not the durable record.

## Durable artifacts

- `output/self-improving-runner/champion-policy.json`: accepted identity and recoverable policy source. This is the policy resumed in later sessions.
- `output/self-improving-runner/episodes.jsonl`: appended episode results with score, kills, hits, shots, accuracy, survival, public death cause when available, and policy identity. Only valid completed deaths support evaluation.
- `output/self-improving-runner/latest-session-summary.json`: current session outcome, stop reason, completed count, comparison decision, evidence, and saved locations.
- `output/self-improving-runner/candidate-summaries/*.json`: unique evaluation records, including champion/candidate source snapshots, batch scores, settings, and retained/rejected decision. Existing evidence is never overwritten.
- `output/self-improving-runner/scoreboard.json`: best-ever individual score, separate from mean-score promotion.
- `output/self-improving-runner/resolved-run-config.json`: latest configuration, saved before play.

Candidate summaries preserve the context needed to interpret historical results, including configured base URL, public profile/tuning identity when available, policy identity, and execution settings. Missing public identity remains unknown. Results from another deployment or revision do not establish current performance.

A baseline summary is initial gameplay evidence, not a promotion. A comparison requires equal-sized completed valid batches, default five each. Champion and candidate means and the strict score-based decision must be reported. Incomplete evaluations and ties cannot replace the accepted policy.

## Near-death evidence

Episode records include `observationActionTail`, the last 40 public observation/action frames, with at most 16 visible targets and 12 feedback events per frame. Inspect target offsets, alignment/fire actions, ammo/reload state, movement, and blocked recovery near death. The history is bounded; it is not a full replay.

Public death cause, when present, is an observation. A suspected acquisition, aiming, reload, or movement failure is an inference. Keep those distinct when writing optional `MEMORY.md` and `SELF_LEARNING.md` notes; do not generate stock “lessons” as proof.

## Other commands

`pnpm smoke:no-context` writes a timestamped `output/no-context-smoke/` folder containing its summary, console evidence, and available screenshots of startup, death, and retry. `pnpm agent:baseline` writes under `output/baseline/`. Normal gameplay/evaluation history lives under `output/self-improving-runner/` unless `OUTPUT_DIR` is explicitly configured.

Timeout, budget, interruption, startup failure, and contract mismatch must preserve earlier completed results. A partial episode cannot increase the completed-attempt count or support promotion. Do not delete output to repair a failing command; inspect the recorded reason first.
