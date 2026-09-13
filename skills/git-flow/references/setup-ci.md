# setup-ci — opt-in CI scaffold

This is the logic behind `/kimi-git-flow:setup-ci`. It detects the
project's stack and drafts a minimal `.github/workflows/ci.yml` that
runs the equivalent of the local check on every push and pull request.

The scaffold is **opt-in only**. It never auto-runs as part of the
main 0→7 procedure; the user must invoke `/kimi-git-flow:setup-ci`
explicitly. A wrong CI workflow is worse than no CI — it turns
green-merge into red-merge — so the workflow always pauses for user
approval before writing the file.

## Detection

Uses the same matrix as `local-check.md`:

| Marker                              | Stack    |
|-------------------------------------|----------|
| `package.json` with `"scripts.test"` | node     |
| `pyproject.toml` or `setup.py`      | python   |
| `Cargo.toml`                        | rust     |
| `go.mod`                            | go       |
| none                                | — (abort) |

If no stack is detectable, the command aborts with a clear message
and the user authors the workflow themselves. We do not guess.

## Refusal conditions

- `.github/workflows/ci.yml` already exists → refuse. The user deletes
  the existing file (or picks a different filename) before retrying.
- Not inside a git repo → refuse (`git rev-parse --is-inside-work-tree`).
- `gh` not authenticated → refuse with the standard `gh auth login`
  hint.

## Generated workflow — Node

Triggers on `pull_request` and `push` to the default branch. Single
job, `ubuntu-latest`. Reads the Node version from `.nvmrc` if present,
otherwise pins to Node 20 (matching `package.json` engines `>=20`):

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [<default-branch>]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ vars.NODE_VERSION || '20' }}
          cache: 'npm'
      - run: npm ci
      - run: npm test --if-present
```

The `cache: 'npm'` line is safe — it only activates when
`package-lock.json` is present and silently no-ops otherwise.

## Generated workflow — Python

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [<default-branch>]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ vars.PYTHON_VERSION || '3.12' }}
          cache: 'pip'
      - run: pip install -e .
      - run: pip install pytest
      - run: pytest -q
```

The user is expected to override `PYTHON_VERSION` via
`Settings → Variables → Actions` if their project pins a specific
Python. The default `3.12` matches what `setup-python` ships as
current.

## Overriding the pinned toolchain version

The generated workflows read their toolchain version from GitHub
Actions variables (`vars.NODE_VERSION`, `vars.PYTHON_VERSION`,
`vars.GO_VERSION`) so the user can pin a project-specific version
without editing the YAML. A few scope notes that bite users:

- GitHub Actions **variables** (`vars.*`) are read at the
  **organization, repository, or environment** level — *not* per
  workflow run and *not* per branch. They cannot be set on a PR. If
  you need a different version on a specific branch, edit the
  workflow file directly instead.
- The variables are optional. If unset, the workflow falls back to
  the default (`20` / `3.12` / `1.23`). The defaults are deliberately
  conservative; they are not auto-upgraded.
- Variable names are case-sensitive on the GitHub side and must match
  exactly what the workflow reads (`NODE_VERSION`, `PYTHON_VERSION`,
  `GO_VERSION`).

## Generated workflow — Rust

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [<default-branch>]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test --quiet
```

No `Swatinem/rust-cache` — we don't pretend to know the user's
`~/.cargo` layout. The user adds it themselves if they want it.

## Generated workflow — Go

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [<default-branch>]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: ${{ vars.GO_VERSION || '1.23' }}
          cache: true
      - run: go test ./...
```

## Default branch substitution

`<default-branch>` is replaced at render time with the value of
`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`. Do
not hard-code `main` — the skill never assumes the default branch.

## Approval gate

After rendering, the workflow prints the full file content to the
chat and waits for one of:

- **"yes" / "yes, write it"** — write the file and proceed.
- **"yes, but use Node 22 only"** — accept modifications, then
  proceed. The user can edit any line before approval.
- **"no" / "cancel"** — discard the draft, leave the working tree
  untouched, exit.

There is no path that writes the file without an explicit "yes" from
the user. If the user is silent, the workflow waits.

## Branch, commit, PR

On approval:

```bash
git checkout -b <branch> origin/<default-branch>

# Write the file. Use Write, not `cat >`, to keep edits auditable.
# .github/workflows/ci.yml

git add -A
git commit -m "ci: add GitHub Actions workflow for <stack>"

git push -u origin <branch>

gh pr create \
  --base <default-branch> \
  --head <branch> \
  --title "ci: add GitHub Actions workflow for <stack>" \
  --fill
```

Then print the PR URL and stop. The user runs
`/kimi-git-flow:watch` and `/kimi-git-flow:merge` to land it.

## What this does NOT do

- Does not write multiple workflows (no separate lint / release / deploy).
- Does not add caching beyond what the official action defaults
  already provide.
- Does not add a status badge.
- Does not configure branch protection (the user does that in
  GitHub Settings → Branches).
- Does not auto-merge the resulting PR.

The whole point is a minimal, readable workflow the user can audit
line by line and modify as needed.
