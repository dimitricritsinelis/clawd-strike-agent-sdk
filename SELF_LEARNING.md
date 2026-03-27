# SELF_LEARNING.md

Curated durable lessons across runs. Keep this focused on heuristics that survived real batch comparison.

<!-- SELF_LEARNING_GENERATED:BEGIN -->
## Stable heuristics that work
- None yet.

## Recurring failure patterns
- candidate tied champion in a zero-contact bootstrap_hit batch (4)

## Experiments that failed
- candidate tied champion in a zero-contact bootstrap_hit batch (4)

## Experiments that improved performance
- None yet.
<!-- SELF_LEARNING_GENERATED:END -->

## Promotion rules

- Promote only on batch evidence.
- In `bootstrap_hit`, prefer real hits over survival-only zero-contact behavior.
- In `bootstrap_kill`, prefer real kills over hit-only survival gains.
- In `stabilize_score`, use the kill -> score -> hit quality -> survival ladder.
- If both candidate and champion are zero-hit and zero-kill, treat the batch as no promotion.

## Stagnation protocol

- If repeated batches fail to promote, widen mutation scale modestly.
- Re-screen the bootstrap catalog before widening mutation too far.
- Try a hall-of-fame parent before changing controller family.
- Escalate from config edits to policy-code edits only after bounded config search stalls.

## Escalation rule

- Config and memory first.
- `src/policies/**` second.
- Runtime wrappers and contract files only with explicit human review.
