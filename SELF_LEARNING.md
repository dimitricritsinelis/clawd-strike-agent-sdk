# SELF_LEARNING.md

Curated durable lessons across runs. Keep this focused on heuristics that survived real batch comparison.

<!-- SELF_LEARNING_GENERATED:BEGIN -->
## Stable heuristics that work

- No stable heuristics have been promoted yet.

## Recurring failure patterns

- No recurring failure patterns recorded yet.

## Experiments that failed

- No failed experiment patterns recorded yet.

## Experiments that improved performance

- No promoted experiment patterns recorded yet.
<!-- SELF_LEARNING_GENERATED:END -->

## Promotion rules

- Promote only on batch evidence.
- In hit bootstrap, prefer real hits over survival-only zero-hit behavior.
- In kill bootstrap, prefer real kills over hit-only survival gains.
- In score optimization, use the kill -> score -> survival -> accuracy ladder.

## Stagnation protocol

- If repeated batches fail to promote, widen mutation scale modestly.
- Try a hall-of-fame parent before changing controller family.
- Escalate from config edits to policy-code edits only after bounded config search stalls.

## Escalation rule

- Config and memory first.
- `src/policies/**` second.
- Runtime wrappers and contract files only with explicit human review.
