# Gameplay improvement playbook

Optional reference; the README is sufficient for startup.

1. Set `BASE_URL` to the configured deployment or an isolated server you own, then run `pnpm agent:run`.
2. Inspect the completed batch. A useful baseline must get at least one kill within five completed attempts. If it does not, inspect public target acquisition and near-death evidence before increasing the budget.
3. Write a hypothesis separate from the observations. Change one behavior in `src/policies/visible-target.mjs`.
4. Run again to compare the edited candidate with the saved champion, freshly evaluated under current conditions. Use equal completed batches, default five each.
5. Retain only a strictly higher mean final score. Reject ties, invalid results, and incomplete comparisons. Preserve both policies and all historical evidence.
6. Repeat within the user's attempt/time budget. In a later session, reuse the same output directory to resume accepted learning.

The SDK runs browser actions and evaluates results. The surrounding agent does the reasoning and code edits between runs. No embedded model or second learning framework is needed. Gameplay success is distinct from demonstrated policy improvement, and no individual attempt is guaranteed to improve.
