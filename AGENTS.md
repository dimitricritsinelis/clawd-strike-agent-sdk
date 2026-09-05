# Clawd Strike Agent SDK Instructions

Use the game's public `/skills.md` and the README quickstart. Normal startup requires no multi-document reading chain. Run `pnpm agent:run` with an explicitly configured `BASE_URL` pointing to the approved deployment or an isolated server you own. Do not start, stop, or assume ownership of an existing developer server.

The surrounding agent supplies reasoning and policy edits. Keep the SDK loop small: observe public state, choose an action, apply it at approximately 8 Hz in elapsed real time, record completed death, release inputs, retry, and reset episode-local memory. Do not call `advanceTime()` in the normal loop or add embedded LLM calls, API-key requirements, or orchestration frameworks.

Edit the baseline in `src/policies/visible-target.mjs`. Use visible target offsets, screenshots, and other documented public observations. Required `perception.visibleTargets` and `perception.movementBlocked` must be validated; missing fields are a compatibility error. Hidden coordinates, occluded enemies, routes, seeds, debug truth, and validation internals remain prohibited.

Play a batch, inspect evidence, change one behavior, compare with the saved champion, retain or reject, and repeat within the user's budget. Compare equal completed batches, defaulting to five episodes per policy, under the same current game conditions. Promote only a strictly higher mean final score. Hits, kills, accuracy, and survival are diagnostics. Ties, incomplete evaluations, and invalid runs cannot promote. Do not claim every attempt improves.

Preserve disk history and accepted policy source between sessions. Append episodes and create unique candidate summaries; never replace historical candidate evidence. Keep best-ever individual score separate from promotion metrics. Browser storage alone is insufficient. Do not use old recordings as evidence for the current game revision.

Record observations separately from inferred causes. Optional `MEMORY.md` and `SELF_LEARNING.md` notes must cite actual episode or comparison evidence; stock phrases are not proven lessons.

Respect attempt/time budgets without counting partial episodes as completed attempts. Report startup failure, contract mismatch, timeout, completed death, and interruption distinctly. Preserve valid completed results when stopping and explicitly release held inputs before changing execution state.

Use `pnpm ci:check` for local verification. Use `pnpm smoke:no-context` for startup/death/retry, and verify the baseline gets at least one kill within five completed attempts against the configured game. Missing coordinated perception blocks integration verification; do not invent a passing result.

Do not commit, push, deploy, or modify the game repository unless explicitly asked. Preserve unrelated changes. Runtime and contract changes require task authorization; a policy experiment alone does not authorize widening the public boundary.
