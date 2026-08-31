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
/kimi-git-flow:pr [--dry-run]
```

No arguments. Operates on the current branch.

`--dry-run` runs the preflight checks and step 2.5 (local check)
*without* pushing or opening a PR, then prints the exact `git push`
and `gh pr create` invocations the command would run. Use this when
you want to see the PR body and the remote call shape before
touching `origin`. The local check itself still runs — `--dry-run`
does not skip step 2.5.

## What this does

1. Confirm the current branch is not the default branch (refuse to open
   a PR from the default branch against itself).
2. Confirm there is at least one commit on the branch ahead of the
   default branch (`git rev-list --count origin/<default>..HEAD` ≥ 1).
3. Run step 2.5 — the local check — against the working tree if the
   branch has a detectable stack and a non-empty diff. The result is
   recorded in `.git/kimi-git-flow/local-check.json` for `/status`,
   `/watch`, and `/merge` to read. See
   `skills/git-flow/references/local-check.md`. Skip when
   `KIMI_GIT_FLOW_SKIP_LOCAL_CHECK=1`. This step is always part of
   `/pr` so the guarantee holds whether the user got here via
   `/branch` + manual edits or via the natural-language workflow.
4. `git push -u origin <branch>`.
5. Build the PR body from
   `skills/git-flow/references/pr-template.md`.
6. `gh pr create --base <default> --head <branch> --title <human> --body-file <body>`.
   Fall back to `--fill` for trivial single-commit changes.
7. Print the PR URL and stop. **Do not watch or merge** — the user does
   that.

## When not to use

- The PR is already open. Use `/kimi-git-flow:status` to inspect; use
  `/kimi-git-flow:watch` to wait for green.
- The branch is the default branch. Refuse.

## Safety

Same hard rules as the main skill: no `--admin`, no `--force`,
`skills/git-flow/references/safety.md` applies. If `gh pr create` fails
because branch protection requires a base branch update or signed
commits, surface the error and stop.

## See also

- `/kimi-git-flow:watch` — wait for CI on the just-opened PR.
- `/kimi-git-flow:status` — see the PR state without doing anything.
