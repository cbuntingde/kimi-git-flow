---
name: watch
description: Wait for the current branch's PR to go green via `gh pr checks --watch`. Use when a PR is open and you want to know whether CI passed.
---

# /kimi-git-flow:watch

Run step 4 of the kimi-git-flow procedure: wait for required CI checks
to go green. Does not merge.

## Usage

```text
/kimi-git-flow:watch
```

Optional env var: `KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN` (default `30`).

## What this does

1. Confirm there is an open PR for the current branch
   (`gh pr view --json number,state,url`).
2. Run `timeout "${KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN:-30}m" gh pr checks --watch --interval 30`.
3. On exit 0 → all checks green. Print "checks green for PR #<n>" and
   stop. The user runs `/kimi-git-flow:merge` next.
4. On exit non-zero → at least one check failed. Print the failing
   check name and run URL. Stop.
5. On `timeout` exit (124) → CI is too slow. Print the timeout, leave
   the PR open, stop.

## When not to use

- The user wants the full workflow end-to-end. Let the natural-language
  trigger fire and the skill handles watch + merge together.
- No PR is open. Use `/kimi-git-flow:pr` first.

## Safety

If branch protection has no required checks, `gh pr checks` returns
empty immediately. The workflow prints a one-line warning and proceeds.
See `references/ci-watch.md` for the full semantics.

## See also

- `/kimi-git-flow:merge` — merge the PR once green.
- `references/ci-watch.md` — what counts as required, what `--watch`
  exit codes mean.