# REPO_BOUNDARY.md

This repo has two layers:

1. SDK / product surface
2. Maintainer-only automation

## SDK / Product Surface

Treat these as the real SDK and public workflow:

- `src/`
- `config/`
- `skills.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/PUBLIC_CONTRACT.md`
- `docs/OUTPUTS.md`
- `docs/POLICY_SCHEMA.md`
- `docs/TROUBLESHOOTING.md`

## Maintainer-Only Automation

Treat `devtools/**` as maintainer-only workflow code.

Ignore `devtools/**` unless the task is specifically about:

- repo testing
- maintainer workflow automation
- fresh-agent packaging checks
- local iteration helpers

## Rule For Fresh Agents

If you are asked to work on the SDK itself, do not treat `devtools/**` as the source of truth for the SDK design.

The SDK/public workflow lives in `src/`, `config/`, `skills.md`, and the public docs.
