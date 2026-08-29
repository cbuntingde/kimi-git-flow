# Merge strategy

Default: **squash**. Override via `KIMI_GIT_FLOW_MERGE_STRATEGY`.

## Decision table

| User intent | Strategy | Flag |
|---|---|---|
| Default. Single task on a branch, history doesn't matter for review. | `squash` | `--squash` |
| "I want a clean linear history, no merge bubbles." | `rebase` | `--rebase` |
| "I need to preserve the commit graph (rare — usually multi-author feature work)." | `merge` | `--merge` |

## How the workflow picks

1. Read `KIMI_GIT_FLOW_MERGE_STRATEGY`. If set to `squash`, `rebase`, or
   `merge`, use that.
2. Otherwise, default to `squash`.
3. The user can override per-invocation by saying "merge this one with a
   merge commit" — the workflow reads the intent from the prompt, not
   just the env var.

## The canonical merge commands

```bash
# Default (squash) — remote branch is kept.
gh pr merge --squash --body "Merged by kimi-git-flow"

# Override: rebase — remote branch is kept.
gh pr merge --rebase --body "Merged by kimi-git-flow"

# Override: merge commit — remote branch is kept.
gh pr merge --merge --body "Merged by kimi-git-flow"

# Opt back into remote deletion (any strategy).
KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH=1 gh pr merge --squash --delete-branch --body "Merged by kimi-git-flow"
```

By default the remote branch is **not** deleted. Pass
`KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH=1` to add `--delete-branch` to whichever
strategy you picked. The workflow then runs
`git checkout <default> && git pull --ff-only && git branch -d <branch>`
locally — the local copy is tidied unconditionally.

## What `--squash` actually does

GitHub takes every commit on the PR branch, squashes them into a single
commit on the default branch, and credits the PR author. The individual
commits remain visible in the PR view but not in the default branch's
log. The PR's title becomes the squash commit message subject.

## What `--rebase` actually does

GitHub rebases the PR branch onto the current tip of the default branch
and fast-forward-merges. Each commit survives in the default branch's
log with the original author and timestamp. The default branch's history
stays linear.

## What `--merge` actually does

GitHub creates a merge commit with both branches as parents. All
individual commits survive. The default branch's history grows a merge
bubble per PR. This is the right choice when:

- The repo's contribution guide mandates merge commits.
- The PR contains commits from multiple authors that need to be
  preserved individually.
- You are merging a long-lived feature branch where the commit
  granularity is meaningful.

## Why default is squash

- One commit per change in `git log` is easier to read.
- Reverts are one-commit operations.
- Bisect stays clean.
- Matches GitHub's own default UI behavior.

## When to NOT use squash

- The PR contains commits that must be attributable to multiple authors
  (rare on solo or pair work).
- The repo enforces a "no squash" policy in `CONTRIBUTING.md` — the
  workflow does not auto-detect this; the user must override.

## Branch retention

- **Remote branch is kept by default.** `gh pr merge` is called without
  `--delete-branch`, so `kimi/<slug>` survives on `origin` after the PR
  merges. Use it for archaeology, audit, or "I want to point someone at
  the exact branch this work landed on."
- **Local copy is always tidied.** Regardless of the env var, step 6 runs
  `git branch -d kimi/<slug>` so the working copy does not accumulate
  stale branches. Local refs are working-copy hygiene; the remote ref is
  the durable record.
- **To opt back into remote deletion**, set
  `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH=1` before invoking
  `/kimi-git-flow:merge`. The workflow passes `--delete-branch` to
  `gh pr merge` and the remote ref is removed on merge.
- **Per-invocation override**: the prompt phrase "delete the branch
  after" forces the deletion path for that run; "keep the branch"
  forces the keep path. Phrase beats env var.

## `--admin` flag

`gh pr merge --admin` bypasses branch protection (required reviews,
required checks, etc.). The workflow **never** passes `--admin`
automatically. If a merge fails because of branch protection, the
workflow surfaces the protection rule and stops. The user runs
`gh pr merge --admin` themselves if they have admin rights and want to
override.