---
name: pr
description: Push the current branch and open a PR against the default branch. Use when you already have commits on the branch but haven't opened the PR yet.
---

# /kimi-git-flow:pr

Run step 3 of the kimi-git-flow procedure: push and open a PR for the
current branch. Assumes steps 0–2 already ran (clean working tree,
branch exists, commits made).

## Usage

```text
/kimi-git-flow:pr
```

No arguments. Operates on the current branch.

## What this does

1. Confirm the current branch is not the default branch (refuse to open
   a PR from the default branch against itself).
2. Confirm there is at least one commit on the branch ahead of the
   default branch (`git rev-list --count origin/<default>..HEAD` ≥ 1).
3. `git push -u origin <branch>`.
4. Build the PR body from `references/pr-template.md`.
5. `gh pr create --base <default> --head <branch> --title <human> --body-file <body>`.
   Fall back to `--fill` for trivial single-commit changes.
6. Print the PR URL and stop. **Do not watch or merge** — the user does
   that.

Step 2.5 (local check) ran during the branch session and its result is
recorded for this branch in `.git/kimi-git-flow/local-check.json`. If
the recorded result is `fail`, push a follow-up commit that fixes the
failure before running `/kimi-git-flow:pr`. See
`skills/git-flow/references/local-check.md`.

## When not to use

- The PR is already open. Use `/kimi-git-flow:status` to inspect; use
  `/kimi-git-flow:watch` to wait for green.
- The branch is the default branch. Refuse.

## Safety

Same hard rules as the main skill: no `--admin`, no `--force`,
`references/safety.md` applies. If `gh pr create` fails because branch
protection requires a base branch update or signed commits, surface the
error and stop.

## See also

- `/kimi-git-flow:watch` — wait for CI on the just-opened PR.
- `/kimi-git-flow:status` — see the PR state without doing anything.