---
name: merge
description: Merge the current branch's PR with the configured strategy and return to the default branch. Local check + CI must be green.
---

# /kimi-git-flow:merge

Run steps 5 and 6 of the kimi-git-flow procedure: merge the PR and
return to the default branch. Assumes the PR is already open and CI is
green (or the user has explicitly waived CI).

## Usage

```text
/kimi-git-flow:merge
```

Optional env vars:

- `KIMI_GIT_FLOW_MERGE_STRATEGY` — `squash` (default), `rebase`, or `merge`.
- `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH` — `1` to pass `--delete-branch` to
  `gh pr merge`; default `0` keeps the remote branch.
- `KIMI_GIT_FLOW_BASE_BRANCH` — override the detected default branch.

## What this does

1. Confirm there is an open PR for the current branch and it is
   mergeable (`gh pr view --json mergeable,state`).
2. Read the local-check result for the current branch from
   `.git/kimi-git-flow/local-check.json`. Verify the recorded `branch`
   field equals the current branch (the file is per-branch but lives
   in shared `.git/` storage; a stale entry from an abandoned branch
   must not block a fresh merge). If the file is missing, the local
   check never ran on this branch — refuse unless
   `KIMI_GIT_FLOW_SKIP_LOCAL_CHECK=1` is set. If the recorded
   `result` is `fail`, refuse: the user must push a follow-up commit
   that fixes the failing check (the workflow re-runs the local check
   on the next run) before retrying. See
   `skills/git-flow/references/local-check.md`.
3. Run `gh pr checks` one more time. If any required check is failing
   or pending, abort with the failing check name. The user must wait
   for green or fix the check.
4. `gh pr merge --<strategy> [--delete-branch] --body "Merged by kimi-git-flow"`.
   Default strategy is `squash`. `--delete-branch` is appended only when
   `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH=1`; otherwise the remote branch
   is kept.
5. `git checkout <default-branch>`.
6. `git pull --ff-only`. If `--ff-only` fails (remote moved during CI
   wait), surface the divergence and stop — user decides how to
   reconcile.
7. `git branch -d <branch>` to tidy the local copy (always runs,
   regardless of `--delete-branch`).
8. Print one of:
   - `merged kimi/<slug> → <default-branch> via PR #<n> (remote branch kept)`
   - `merged kimi/<slug> → <default-branch> via PR #<n> (remote branch deleted)`
   and stop.

## When not to use

- CI is red. Fix the check first, then retry. The workflow will refuse.
- The user wants to abandon the branch without merging. Use
  `/kimi-git-flow:back-to-main` instead.
- Branch protection requires a review the user does not have. Surface
  the missing reviewers and stop.
- The local check (step 2.5) failed on this branch — the result is
  visible in `/kimi-git-flow:status`. Fix the failing check, push a
  follow-up commit, and retry.

## Safety

- Never passes `--admin` to `gh pr merge`. If branch protection blocks
  the merge, the workflow prints what's missing and stops.
- Refuses to run if the current branch is the default branch.
- Refuses to run if there is no open PR for the current branch.

See `skills/git-flow/references/safety.md` for the full rule set.

## See also

- `/kimi-git-flow:watch` — confirm CI is green before merging.
- `skills/git-flow/references/merge-strategy.md` — squash vs. rebase
  vs. merge.
