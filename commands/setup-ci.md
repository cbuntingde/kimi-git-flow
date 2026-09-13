---
name: setup-ci
description: "One-shot opt-in: scaffold a minimal `.github/workflows/ci.yml` for the detected stack and open a PR. Never auto-runs."
---

# /kimi-git-flow:setup-ci

One-shot bootstrapper that drafts a `.github/workflows/ci.yml` for the
detected stack, requires explicit user approval before writing, and
opens a PR. Lives **outside** the 0→7 main procedure.

## Usage

```text
/kimi-git-flow:setup-ci
```

No arguments. No env vars.

## What this does

1. Preflight (same checks as step 0): confirm git repo, `gh auth`,
   detect default branch.
2. Refuse if `.github/workflows/ci.yml` already exists. The user
   deletes it manually first if they want to overwrite.
3. Detect the stack per
   `skills/git-flow/references/setup-ci.md`. If no stack is detectable
   (no `package.json`, no `pyproject.toml`, no `Cargo.toml`, no
   `go.mod`), abort — the user authors the workflow themselves.
4. Render the workflow content into a temp file under the working
   tree (NOT yet committed) and print the full content to the chat.
5. Wait for explicit user approval. One of:
   - **"yes" / "yes, write it"** — proceed.
   - **"yes, but <modification>"** — apply the user's edit, then
     proceed.
   - **"no" / "cancel"** — discard the draft, leave the working tree
     untouched, exit.
   - silence → wait. Do not write the file until the user types
     something.
6. On approval: `git checkout -b <branch> origin/<default>`,
   `git add -A`, commit with subject
   `ci: add GitHub Actions workflow for <stack>`,
   `git push -u origin <branch>`,
   `gh pr create --fill`. Print the PR URL and stop.

The user runs `/kimi-git-flow:watch` and `/kimi-git-flow:merge` to
land it.

## When not to use

- The repo already has CI. The workflow refuses to overwrite.
- The repo has no detectable stack. Author the workflow yourself.
- You want CI to fire without a PR. `setup-ci` always goes through a
  PR — the user reviews the generated YAML before it lands.

## Safety

- Never writes the file without explicit "yes" from the user.
- Never passes `--admin` to `gh pr merge` (it doesn't merge anyway).
- Never bypasses branch protection on the resulting PR.
- Refuses to run from a non-git repo or with `gh` unauthenticated.

## Known limitation: approval parsing

The "wait for explicit user approval" gate relies on the agent
correctly interpreting free-form chat for `yes`, `no`, or silence.
The agent does not run deterministically — borderline phrases
(`yep` without a body, `sure, looks right`, emoji-only replies) may
be parsed as approval when the user meant otherwise. If a misread is
critical, the user can revoke by deleting the uncommitted workflow
file before any push happens, since `git add`/`git commit` only fire
after the explicit "yes". Do not rely on this gate as a hard safety
boundary — it is a friction reducer, not a permission system.

## See also

- `skills/git-flow/references/setup-ci.md` — stack matrix and the
  exact YAML each stack produces.
- `/kimi-git-flow:branch` + `/kimi-git-flow:pr` — the normal path when
  CI is already configured.
- `skills/git-flow/references/local-check.md` — what the workflow runs
  locally before pushing; the generated `ci.yml` runs the same
  command on the runner.
