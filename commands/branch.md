---
name: branch
description: Create a new branch from the default branch, following the repository's branch-naming convention, and stop. Use when you want to drive the rest of the workflow manually.
---

# /kimi-git-flow:branch <slug>

Run steps 0 and 1 of the kimi-git-flow procedure and stop. Leaves the
user on the new branch with a clean working tree.

## Usage
```text
/kimi-git-flow:branch <slug> [--dry-run]
```

If `<slug>` is omitted, derive one from the most recent user message
(see `skills/git-flow/references/branch-naming.md`).

`--dry-run` runs the preflight, branch-name resolution, and collision
check as normal, then prints the exact `git`/`gh` invocations the command
*would* run, without mutating the repo. Use this when you want to
audit what the procedure will do without creating a branch.

## What this does

1. Preflight (see `skills/git-flow/SKILL.md` step 0): confirm git repo,
   `gh auth`, clean working tree, and detect default branch.
2. Resolve the branch name per
   `skills/git-flow/references/branch-naming.md`. Cap the slug at 48
   chars. Append `-2`, `-3`, ... on collision.
3. `git fetch origin "<default-branch>"`. Quote the ref: a branch name is
   remote-controlled and may contain shell metacharacters.
4. `git checkout -b "<branch>" "origin/<default-branch>"`.
5. Print the resolved branch name and stop. **Do not commit, push, or
   open a PR** — that's the user's next step.

## When not to use

- The user wants the full workflow end-to-end. Use the natural-language
  trigger ("rename X to Y", "fix the Y bug") and the skill handles it.
- The user wants to push and open a PR right now. Use
  `/kimi-git-flow:pr` after `/kimi-git-flow:branch` instead.

## Safety

This command refuses to run on a dirty working tree. If `gh` is not
authenticated, it prints the exact `gh auth login` command and stops.

## See also

- `/kimi-git-flow:pr` — push and open the PR for the current branch.
- `skills/git-flow/SKILL.md` step 0–1 — full preflight + branch
  creation logic.
