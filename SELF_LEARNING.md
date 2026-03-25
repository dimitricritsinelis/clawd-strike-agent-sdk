# SELF_LEARNING.md

Curated durable lessons across runs. Keep this focused on heuristics that survived real batch comparison.

<!-- GENERATED:START -->
## Stable heuristics that work

- No stable heuristics have been promoted yet.

## Recurring failure patterns

- No recurring failure patterns recorded yet.

## Experiments that failed

- No failed experiment patterns recorded yet.

## Experiments that improved performance

- No promoted experiment patterns recorded yet.
<!-- GENERATED:END -->

## Promotion rules

- Promote only on batch evidence.
- Prefer:
  1. more kill-positive episodes
  2. more total kills
  3. higher best score
  4. higher median score
  5. higher mean survival
  6. higher accuracy with comparable shot volume

## Stagnation protocol

- If repeated batches fail to promote, widen mutation scale modestly.
- Try a hall-of-fame parent before changing controller family.
- Escalate from config edits to policy-code edits only after bounded config search stalls.

## Escalation rule

- Config and memory first.
- `src/policies/**` second.
- Runtime wrappers and contract files only with explicit human review.
