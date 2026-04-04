# MAINTAINER_TESTING.md

These workflows are maintainer-only helpers. They are not part of the public SDK contract.

## Which Workflow To Use

If you changed normal SDK code such as controller, learner, or config logic:

Run: `pnpm test:unit`

Then run: `pnpm dev:quick-run`

If you changed `skills.md` and want to test fresh-agent behavior:

Run: `pnpm dev:fresh-agent`

Then open a brand-new Codex session in the printed temp folder.

Then send: `Follow AGENTS.md.`

## Fast local iteration against Vercel

Run: `pnpm dev:quick-run`

This runs the same deployed game on `https://clawd-strike.vercel.app/` with small budgets and unique output/profile paths so you can test a controller or learner change quickly.

Defaults:

- `ATTEMPT_BUDGET=5`
- `BASELINE_DEATHS=1`
- `CANDIDATE_SCREEN_DEATHS=1`
- `CANDIDATE_DEATHS=1`
- `MAX_CANDIDATES=2`
- `TIME_BUDGET_MINUTES=3`

Outputs go under `output/maintainer-quick/<timestamp>/`.

## Fresh-agent packaging check

Run: `pnpm dev:fresh-agent`

This creates a brand-new temp workspace containing:

- the current local `skills.md`
- a minimal `AGENTS.md`

Use that temp workspace when you want to verify that a contextless agent:

- does not just materialize `skills.md`
- treats `skills.md` as instructions
- uses the SDK workflow instead

The generated `AGENTS.md` also instructs the agent to leave behind `progress_report.md` as a detailed journal of what it was asked to do, what it actually did, what it thinks went well, what failed, and how to improve the instructions.
The report also asks for key decisions, environment assumptions, stop reason, expected artifacts, and the top 3 concrete instruction or SDK improvements.

Compatibility aliases:

- `pnpm agent:quick`
- `pnpm test:fresh-agent`

### How To Run In Codex

1. Run: `pnpm dev:fresh-agent`
2. Copy the printed `workspaceDir`.
3. Open a brand-new Codex session in that temp folder.
4. Send: `Follow AGENTS.md.`
5. Let the agent run.
6. Review the files it leaves behind, especially `progress_report.md`.

## Release confidence

Run: `pnpm agent:run`

Use maintainer helpers for iteration, and reserve `pnpm agent:run` for the slower end-to-end check.
