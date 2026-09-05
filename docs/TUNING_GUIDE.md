# Policy tuning

Optional reference. Edit one behavior in `src/policies/visible-target.mjs`, then compare against the recoverable saved champion through `pnpm agent:run`.

Use public evidence to choose the behavior:

- Acquisition: visible-target counts and search actions.
- Aiming: relative offsets before and after look actions; whether fire occurred while aligned.
- Reloading: magazine/reserve state and reload actions near death.
- Movement: movement actions, `movementBlocked`, and recovery actions.

These signals support hypotheses, not proven causes. Change one behavior and evaluate it over equal completed batches, defaulting to five episodes per policy. Use the same configured URL and execution settings. Champion scores must come from a fresh evaluation, not old recordings.

Mean final score decides promotion. Best-ever individual score, kills, hits, shots, accuracy, and survival are reported separately. Larger raw totals from a larger batch cannot justify promotion. Ties, incomplete batches, and invalid runs reject the candidate.

Do not expand the blind sweeper's parameter catalog, add a second optimizer, or increase the attempt budget as the only response to failed target acquisition.
