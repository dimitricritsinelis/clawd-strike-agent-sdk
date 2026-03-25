# Clawd Strike learning playbook

Optional background doc. This is not part of the required reading order.

## Objective

Make a contextless agent:

1. enter Agent Mode
2. play repeated runs
3. keep memory
4. improve
5. repeat without widening the public contract

## Minimal architecture

Use four layers:

1. public contract adapter
2. bounded controller family
3. durable memory artifacts
4. batch optimizer

## Stage order

1. hit bootstrap
2. kill bootstrap
3. score optimization

## Promotion stance

Promote only on batch evidence.

If the champion has zero hits and zero kills:

- prioritize hit-positive episodes
- then total hits
- then kills
- then score and survival

If the champion has hits but zero kills:

- prioritize kill-positive episodes
- then total kills
- then hit consistency
- then score and survival

Once the first-kill baseline is met:

- optimize kills
- optimize score
- optimize survival
- optimize accuracy with comparable shot volume

## Persistence surfaces

Durable learning requires:

- a persistent browser profile for browser-session `best`
- a persistent workspace for `episodes.jsonl`, `champion-policy.json`, summaries, and semantic notes

## Anti-patterns

- raising the attempt budget after a completely hitless batch and calling that learning
- promoting a survival-only zero-hit candidate
- full controller rewrites every attempt
- treating hidden truth as fair game
