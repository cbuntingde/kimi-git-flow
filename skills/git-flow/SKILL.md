---
name: git-flow
description: "Branch-per-change GitHub workflow: fresh branch → commit → local check → push → PR → wait for CI → merge → return to default. Drives `gh` and `git` via Bash."
license: Apache-2.0
compatibility: Requires git and gh (GitHub CLI) on PATH, with `gh auth status` succeeding for the target repo's host. Targets Kimi Code CLI >= 1.0.
metadata:
  kimi:origin: kimi-git-flow
allowed-tools: Bash Read Grep
---

# kimi-git-flow — branch → PR → wait for green → merge → back to default

You are operating the standard GitHub branch-and-PR workflow on behalf of
the user. One fresh branch per phase, per task, or per general code change.
You commit, push, open a PR, wait for CI, merge, and return the working
copy to the default branch. Never co-mingle unrelated changes.

## When to use this skill

Fire when any of these is true:

- The user is in a git repo and asks for a code change ("rename this
  function", "fix the bug where X", "add Y to the dashboard").
- The user explicitly asks to "create a branch", "open a PR", "merge when
  green", "auto-merge", or "branch per task".
- The user is iterating through a numbered plan and just said "do phase 2"
  or "now the auth changes" — each phase is its own branch.
- The user invokes a slash command from this plugin (`/kimi-git-flow:branch`,
  `/kimi-git-flow:pr`, `/kimi-git-flow:watch`, `/kimi-git-flow:merge`,
  `/kimi-git-flow:status`, `/kimi-git-flow:back-to-main`).

Do **not** fire when:

- The user is just reading code, asking questions, or asking for
  explanations.
- The repo is not a git repo, or `gh repo view` fails.
- The change is documentation-only and the user explicitly says "no PR
  needed" (still create a branch if the user wants the work isolated).

## The procedure

Run these steps in order. **Stop on any safety failure** (see
`references/safety.md`) and surface the exact problem to the user.

### 0. Preflight

Every check aborts the run. Run them in order; do not continue past a
failure.

```bash
# 0a. Must be inside a git working tree.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "aborted: not a git repository. cd into the repository and retry."
  exit 1
fi

# 0b. gh must be authenticated for the target host.
if ! gh auth status >/dev/null 2>&1; then
  echo "aborted: gh not authenticated. Run \`gh auth login\` and retry."
  exit 1
fi

# 0c. The working tree must be clean.
if [ -n "$(git status --porcelain)" ]; then
  echo "aborted: dirty working tree. Commit or stash your changes before starting a new branch."
  exit 1
fi

# 0d. Detect the default branch (do NOT assume "main"). KIMI_GIT_FLOW_BASE_BRANCH
# overrides detection. An empty value must abort here — it would make every
# later ref expansion (`origin/`) meaningless.
DEFAULT_BRANCH="${KIMI_GIT_FLOW_BASE_BRANCH:-$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || true)}"
if [ -z "$DEFAULT_BRANCH" ]; then
  echo "aborted: could not determine the default branch. Set KIMI_GIT_FLOW_BASE_BRANCH and retry."
  exit 1
fi

# 0e. Fetch, then confirm the remote-tracking ref exists. Without a local
# `origin/<default-branch>`, the divergence check below runs `git log` against
# a missing revision, which exits 128 with empty output — the guard would read
# an empty string and silently pass, defeating the rule 12 check entirely.
if ! git fetch origin "$DEFAULT_BRANCH"; then
  echo "aborted: could not fetch origin/$DEFAULT_BRANCH."
  exit 1
fi
if ! git rev-parse --verify --quiet "refs/remotes/origin/$DEFAULT_BRANCH" >/dev/null; then
  echo "aborted: origin/$DEFAULT_BRANCH is not a known remote-tracking ref after fetch."
  exit 1
fi

# 0f. Confirm local default branch is in sync with origin. Refuse to proceed if
# there are unpushed local commits — see rule 12 in `references/safety.md`. This
# gate prevents the agent from "rescuing" the user's unmerged work by stashing
# it, resetting it, or branching off it. The ref is quoted for hygiene: git
# rejects refnames with whitespace or glob characters, and a shell variable's
# contents are never re-expanded, so this is not an injection barrier.
unpushed=$(git log --oneline "origin/${DEFAULT_BRANCH}..${DEFAULT_BRANCH}")
if [ -n "$unpushed" ]; then
  echo "unpushed commits on ${DEFAULT_BRANCH}:"
  echo "$unpushed"
  echo "aborted: local ${DEFAULT_BRANCH} is ahead of origin/${DEFAULT_BRANCH}. Push, rebase, or drop them before starting a new branch."
  exit 1
fi
```

For a dirty working tree, offer `git stash` or "commit your existing
changes first" and wait for the user. For unpushed local commits on the
default branch, the preflight prints the exact commit list (so the user
can decide whether the work is worth keeping) and the reconciliation
commands (`git push origin <default>`, `git rebase origin/<default>`, or
`git reset --hard origin/<default>`) and stops — the agent does not pick
one on the user's behalf.

### 1. Create the branch

Determine the project's branch-naming convention (see
`references/branch-naming.md`) and build the branch name from it:

1. If the repository documents a convention (a contributing guide, a
   git-workflow doc, ...), follow it exactly.
2. Otherwise, infer it from the dominant pattern in the repository's
   recent branch names (`git branch -r`, `gh pr list --json headRefName`).
3. Otherwise, fall back to `<type>/<slug>` (e.g. `feature/`, `fix/`,
   `docs/`).

Normalize the `<slug>` portion (lowercase, kebab-case, ≤ 48 chars, no
trailing dash). Never impose a tool-specific prefix.

Examples: `feature/my-change`, `fix/login-redirect`,
`refactor/error-types`.

```bash
# Preflight (0e) already fetched origin/$DEFAULT_BRANCH.
git checkout -b "<branch>" "origin/$DEFAULT_BRANCH"
```

If the branch already exists locally or remotely, append `-2`, `-3`, ...
until checkout succeeds. Surface the resolved name.

### 2. Do the work and commit

Make your edits with the normal Edit/Write tools. When the change is
complete:

```bash
git add -A
git commit -m "<conventional-commit subject>

<optional body explaining why>"
```

Both subject and body must pass the language filter in
`references/language.md` before `git commit` fires. A blocked token
aborts the step before any commit lands.

Conventional-commit subject format: `<type>(<scope>): <subject>`. Allowed
types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`,
`build`, `ci`. Keep the subject under 72 characters.

### 2.5 Local check

Detect the project's stack per `references/local-check.md` and run the
matching runner against the working tree. Skip silently when
`KIMI_GIT_FLOW_SKIP_LOCAL_CHECK=1`.

- On `pass` → print the one-line summary and proceed to step 3.
- On `fail` → print the runner output tail (last 50 lines) and abort
  with the standard abort-message format. The user fixes the test,
  then re-runs.
- On `skipped` (no detectable stack or empty diff vs. the default
  branch) → print `local check: skipped (<reason>)` and proceed. Do
  not block.

This step fires even when remote CI is configured. Remote CI is the
source of truth for merge gating; the local check is a fast pre-push
sanity check so obvious failures don't reach the PR.

### 3. Push and open the PR

```bash
git push -u origin <branch>

gh pr create \
  --base <default-branch> \
  --head <branch> \
  --title "<human-readable title>" \
  --body-file <path-to-template-from-references-pr-template>
```

For trivial changes where the user does not want a heavy body, fall back
to `gh pr create --fill`.

Both the PR title (which becomes the squash-commit subject on merge)
and every line of the rendered PR body must pass the language
filter in `references/language.md` before `gh pr create` fires. A
blocked token aborts the step before the PR is opened.

### 4. Wait for CI to go green

```bash
timeout "${KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN:-30}m" \
  gh pr checks --watch --interval 30
```

Exit-code handling for `gh pr checks --watch`:

| Exit | Meaning | Workflow action |
|---|---|---|
| 0 | All required checks passed. | Proceed to merge. |
| 1 | One or more required checks failed. | Surface the failing check name and the run URL. **Do not merge.** |
| 8 | `gh` itself errored (network, auth). | Re-run once; if it persists, surface the `gh` error to the user. |
| 124 (from `timeout`) | Wall-clock deadline fired before checks resolved. | Leave the PR open, report the timeout, stop. |

Fallback when `--watch` is unavailable (older `gh` < 2.40 emits
"unknown flag"): poll `gh pr checks --json state` every 30 s until all
checks reach a terminal state, then fail if any are `FAILURE`. See
`references/ci-watch.md` for the exact polling loop. Always try
`--watch` first; only fall back when `gh` explicitly rejects the flag.

**Actions unavailable.** If the account's plan or the repository
settings switch Actions off, no check will ever report on the pull
request. Detect that before waiting:

```bash
gh api "repos/{owner}/{repo}/actions/permissions" -q .enabled
```

On `false`, or on a `404`/`403` from `gh api`, skip the watch and use
the step 2.5 local check as the merge gate: a `pass` or `skipped`
result proceeds to step 5, a `fail` result aborts. Print:

```
no remote CI: Actions is unavailable for this repository; local check result was <pass|fail|skipped> at step 2.5
```

See `references/ci-watch.md` for the full case.

When the workflow reaches step 4 with no remote CI configured (the
"no required checks" case in `references/ci-watch.md`), print the
local-check result from step 2.5 so the user has a unified picture of
what was checked:

```
no remote CI detected; local check result was <pass|fail|skipped> at step 2.5
```

See `references/ci-watch.md` for the full semantics (what counts as
"required", what to do if `--watch` is unavailable on this `gh` version).

### 5. Merge

```bash
# Read the documented strategy override. An unrecognized value aborts rather
# than falling through to squash — a typo must not pick a strategy the user
# did not ask for.
case "${KIMI_GIT_FLOW_MERGE_STRATEGY:-squash}" in
  squash) STRATEGY=--squash ;;
  rebase) STRATEGY=--rebase ;;
  merge)  STRATEGY=--merge  ;;
  *)
    echo "aborted: KIMI_GIT_FLOW_MERGE_STRATEGY must be squash, rebase, or merge (got '${KIMI_GIT_FLOW_MERGE_STRATEGY}')."
    exit 1
    ;;
esac

if [ "${KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH:-0}" = "1" ]; then
  gh pr merge "$STRATEGY" --delete-branch --body "Merged by kimi-git-flow"
else
  gh pr merge "$STRATEGY" --body "Merged by kimi-git-flow"
fi
```

`--squash` is the default. The user can override via
`KIMI_GIT_FLOW_MERGE_STRATEGY=rebase` or `=merge`. See
`references/merge-strategy.md` for the decision tree.

The remote branch (`<branch>` on `origin`) is **kept by default** after
merge. Set `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH=1` to pass `--delete-branch`
to `gh pr merge` and clean up the remote ref. The local copy is always
tidied in step 6 regardless of this setting.

If `gh pr merge` fails because branch protection requires a review the
user does not have, surface the required reviewers and stop. **Never
pass `--admin` automatically.**

### 6. Return to the default branch

```bash
git checkout <default-branch>
git pull --ff-only

# Always tidy the local copy — the remote branch is kept unless
# KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH=1 was set (handled in step 5).
git branch -d <branch> 2>/dev/null || true
```

If the user's local branch and remote branch are out of sync after the
merge (e.g. another merge landed during the CI wait), `git pull --ff-only`
will catch it. If `--ff-only` fails, surface the divergence and stop.

#### Recovering from a divergent default branch

`git pull --ff-only` failing means local `<default-branch>` and
`origin/<default-branch>` have diverged. Three options, in order of
preference:

1. **`git pull --rebase`** — replay local commits on top of the new
   `origin` tip. Use when the local commits are unreleased work the
   user wants to keep. If conflicts arise, stop and surface them;
   do **not** "resolve by taking ours."
2. **`git pull --no-rebase`** — create a merge commit joining the
   two lines. Use when the local commits have already been shared
   or you want a paper trail. Acceptable but produces a noisier
   history than option 1.
3. **`git reset --hard origin/<default-branch>`** — discard local
   commits. **Sanctioned only when every local commit is already
   reachable from `origin/<default-branch>`** (i.e. the merge
   already landed and the local copy is just stale). Verify with:

   ```bash
   git log --oneline origin/<default-branch>..HEAD   # local-only
   git log --oneline HEAD..origin/<default-branch>   # remote-only
   ```

   If `local-only` is non-empty, **stop and ask the user.**
   This is rule 11 (no silent revert) and rule 12 (no dropping
   unpushed work) in `references/safety.md`.

The workflow prints the exact diagnostic and all three options, then
stops. The user runs the chosen option's command themselves; the
agent does not pick on the user's behalf.

### 7. Loop

Return to step 0 for the next phase / task / change. **One branch per
change.** Never reuse a branch for an unrelated edit.

## Slash command mapping

| Command | Steps it runs |
|---|---|
| `/kimi-git-flow:branch <slug>` | 0, 1 |
| `/kimi-git-flow:pr` | 3 |
| `/kimi-git-flow:watch` | 4 |
| `/kimi-git-flow:merge` | 5, 6 |
| `/kimi-git-flow:status` | read-only — print current branch, PR URL, check states |
| `/kimi-git-flow:back-to-main` | 6 only (no merge; abandons current branch) |
| `/kimi-git-flow:setup-ci` | one-shot bootstrapper — drafts `.github/workflows/ci.yml`, requires user approval, opens a PR. Outside the 0→7 procedure. |

The slash commands are escape hatches — the natural-language workflow is
the default entry point. Read each command's body for exact behavior.

## Configuration

Read these env vars at run time:

| Var | Default | Effect |
|---|---|---|
| `KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN` | `30` | Timeout for `gh pr checks --watch`. |
| `KIMI_GIT_FLOW_MERGE_STRATEGY` | `squash` | `squash` / `rebase` / `merge`. |
| `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH` | `0` | When `1`, pass `--delete-branch` to `gh pr merge`. Default `0` keeps the remote branch. |
| `KIMI_GIT_FLOW_BASE_BRANCH` | _(auto-detect from `gh`)_ | Override default branch. |
| `KIMI_GIT_FLOW_SKIP_LOCAL_CHECK` | `0` | When `1`, skip step 2.5 entirely. |
| `KIMI_GIT_FLOW_LOCAL_CHECK_TIMEOUT` | `300` | Per-check timeout in seconds for step 2.5. |

## State persistence

After every successful step, write
`.git/kimi-git-flow/state.json` with the schema in
`references/state.md`. The values are:

| Step | `lastAction` |
|---|---|
| 1 (branch created) | `branched` |
| 2 (commit made) | `committed` |
| 3 (push + PR open) | `pr-opened` (+ `prNumber`, `prUrl`) |
| 4 (CI green) | `watched-green` (+ `prNumber`, `prUrl`) |
| 5 (merged) | `merged` (+ `prNumber`, `prUrl`) |
| `/back-to-main` | `abandoned` |

Push and PR opening are a single step (step 3) and produce one value,
`pr-opened`. A separate `pushed` value is not used. See
`references/state.md` for the full schema and rationale.

The local-check result is written separately to
`.git/kimi-git-flow/local-check.json` (see `local-check.md`). State
writes are best-effort: if the disk write fails, the workflow
continues — never block on state persistence.

## Output contract

When the workflow completes successfully, print a one-line summary. The
parenthetical reflects whether the remote branch was kept or deleted:

```
merged <branch> → <default-branch> via PR #<n> (remote branch kept)
merged <branch> → <default-branch> via PR #<n> (remote branch deleted)
```

When it stops early, print the **exact** reason and the next step the
user should take. Do not print a wall of debug output.

## See also

- `references/branch-naming.md` — slug rules and collision handling.
- `references/pr-template.md` — PR body template.
- `references/ci-watch.md` — CI wait semantics.
- `references/local-check.md` — step 2.5 detection + runner matrix.
- `references/setup-ci.md` — `/kimi-git-flow:setup-ci` scaffold logic.
- `references/merge-strategy.md` — squash vs. rebase vs. merge.
- `references/safety.md` — hard rules and abort conditions.
- `references/language.md` — slang and jargon blocklist for commit
  messages, PR titles, and PR bodies.