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
   (`gh pr view --json number,state,url`). If `gh pr view` exits
   non-zero because there is no PR on the current branch, abort with:

   ```
   aborted: no pull request for current branch <name>. Run /kimi-git-flow:pr first.
   ```

   Do not silently swallow the `gh` failure — the user needs the
   exact recovery command.
2. Run `timeout "${KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN:-30}m" gh pr checks --watch --interval 30`.
3. On exit 0 → all checks green. Print "checks green for PR #<n>" and
   stop. The user runs `/kimi-git-flow:merge` next.
4. On exit 1 → at least one check failed. Print the failing check name
   and run URL. Stop.
5. On exit 8 → `gh` itself errored (network, auth). Re-run once. If
   the error persists, print the `gh` error and stop.
6. On `timeout` exit (124) → CI is too slow. Print the timeout, leave
   the PR open, stop.
7. If `gh` rejects `--watch` as an unknown flag (older `gh` < 2.40),
   fall back to the polling loop documented in
   `skills/git-flow/references/ci-watch.md`: poll `gh pr checks --json
   state` every 30 s until all checks reach a terminal state, then
   fail if any are `FAILURE`. Always try `--watch` first; only fall
   back when `gh` explicitly rejects the flag.

When the branch has no remote CI configured (the "no required checks"
case in `skills/git-flow/references/ci-watch.md`), print the
local-check result from step 2.5 at the top of the output so the user
has a unified picture of what was checked:

```
no remote CI detected; local check result was <pass|fail|skipped> at step 2.5
```

The local-check result is read from
`.git/kimi-git-flow/local-check.json` on the current branch.

## When not to use

- The user wants the full workflow end-to-end. Let the natural-language
  trigger fire and the skill handles watch + merge together.
- No PR is open. Use `/kimi-git-flow:pr` first.

## Safety

If branch protection has no required checks, `gh pr checks` returns
empty immediately. The workflow prints a one-line warning and proceeds.
See `skills/git-flow/references/ci-watch.md` for the full semantics.

## See also

- `/kimi-git-flow:merge` — merge the PR once green.
- `skills/git-flow/references/ci-watch.md` — what counts as required,
  what `--watch` exit codes mean.
