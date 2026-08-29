---
name: back-to-main
description: Abandon the current branch (no merge) and switch the working copy back to the default branch. Use when a branch is past saving and you want to start fresh on default.
---

# /kimi-git-flow:back-to-main

Run step 6 of the kimi-git-flow procedure without step 5: discard the
branch and return to default. Does not merge.

## Usage

```text
/kimi-git-flow:back-to-main [--delete-remote]
```

Optional `--delete-remote` flag also removes the remote branch via
`git push origin --delete <branch>`. Without the flag, the remote
branch is left intact.

## What this does

1. Confirm the current branch is not the default branch (refuse to
   run from the default branch).
2. `git checkout <default-branch>`.
3. `git pull --ff-only`.
4. `git branch -D <current-branch>` to remove the local branch
   (capital `-D` because the branch may have unmerged commits — that's
   the point of this command).
5. If `--delete-remote` was passed: `git push origin --delete <branch>`.
6. Print `abandoned kimi/<slug>; returned to <default-branch>` and stop.

## When not to use

- The branch has work worth keeping. Use `git stash` or merge it via
  `/kimi-git-flow:merge` instead.
- The remote branch is shared with someone else. `--delete-remote` will
  break their checkout. The workflow warns once if the branch has more
  than one commit ahead of the default branch.

## Safety

- Refuses to delete the default branch locally (`git branch -D
  <default>` would fail anyway).
- Refuses `--delete-remote` if the branch has more than one commit
  ahead of the default branch **unless** the user has explicitly typed
  `--delete-remote` (typing it is the explicit approval).
- Does not modify any commits. Just deletes the ref.

## See also

- `/kimi-git-flow:merge` — if the branch is worth keeping.
- `references/safety.md` — hard rules (no `--force`, no skipping).