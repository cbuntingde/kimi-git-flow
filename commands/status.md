---
name: status
description: Read-only — show the current branch, the PR associated with it, and the state of its CI checks. Use to inspect without changing anything.
---

# /kimi-git-flow:status

Read-only inspection. Prints the workflow state. Does not commit, push,
open a PR, watch, or merge anything.

## Usage

```text
/kimi-git-flow:status
```

No arguments. No env vars.

## What this prints

In order:

1. **Repo**: `<owner>/<repo>` from `gh repo view --json nameWithOwner`.
2. **Default branch**: from `gh repo view --json defaultBranchRef`.
3. **Current branch**: from `git rev-parse --abbrev-ref HEAD`.
4. **Is current branch the default?**: yes/no.
5. **Working tree state**: clean / N files dirty (from `git status --porcelain | wc -l`).
6. **Local check (step 2.5)**: the recorded result for this branch from
   `.git/kimi-git-flow/local-check.json`, printed as
   `stack=<...> command="<cmd>" result=<pass|fail|skipped> duration=<Ns>`.
   Absent when no check has run on this branch yet. See
   `skills/git-flow/references/local-check.md`.
7. **PR for current branch** (if not the default branch):
   - PR number, state (open/closed/merged), URL.
   - Commits ahead of default: `git rev-list --count origin/<default>..HEAD`.
   - Check states from `gh pr checks --json name,state`:
     - one line per check, color-coded by state.
8. **Last action**: the most recent step this workflow ran on the current
   branch. Read from `.git/kimi-git-flow/state.json` (gitignored).
   Values: `branched`, `committed`, `pr-opened`, `watched-green`,
   `merged`, `abandoned`, or `null` when no run has happened on this
   branch yet. The enum covers both push and PR opening under a single
   value (`pr-opened`); see `skills/git-flow/references/state.md`.

The output is plain text, suitable for pasting back to the user.

## When not to use

- The user wants the workflow to do something. This command is
  read-only.
- The user wants the history of all branches the workflow has touched.
  That requires tracking branch names separately, or a dedicated audit
  tool.

## Safety

This command never modifies the repo. Safe to run at any time, including
mid-merge, mid-watch, or with a dirty working tree.

## See also

- `/kimi-git-flow:branch`, `/kimi-git-flow:pr`, `/kimi-git-flow:watch`,
  `/kimi-git-flow:merge`, `/kimi-git-flow:back-to-main` — the
  side-effecting siblings.
