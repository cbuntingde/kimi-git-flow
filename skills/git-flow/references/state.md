# Workflow state file

The workflow persists per-branch state to
`.git/kimi-git-flow/state.json` (gitignored, inside the shared
`.git/` directory). `/kimi-git-flow:status` reads it so the user can
see what the workflow did most recently on the current branch without
re-running anything.

## Location

```text
.git/kimi-git-flow/state.json
```

The file lives under `.git/`, so it is shared across all working
copies of the same repo but never committed. Each entry is keyed by
branch name. There is at most one entry per branch; running a new
step overwrites the previous entry.

### Scope: which checkout owns the file?

`.git/` is shared across all working copies of the repo, but the
state file is only meaningful in the checkout that wrote it. The
following situations produce stale or misleading `/status` output
and the workflow does **not** try to detect them — surface the
truth to the user instead:

- **Multiple clones** of the same repo. `/status` reads whatever the
  *current* clone wrote last. A branch worked on in clone A may show
  the state file's view from clone B.
- **Worktrees** (`git worktree add ...`). Each worktree shares `.git/`
  but has its own HEAD. The state file's `branch` field matches the
  *writing* worktree's branch, not necessarily the current one.
- **Detached HEAD.** The workflow never writes a state file while
  detached (every entry requires a `<branch>` branch), but reads
  still happen. `/status` will show the most recent entry for
  whatever branch the file last mentioned, even though the user is
  not on it.

The fix in all three cases is the same: switch back to the
`<branch>` branch the user actually worked on, then re-run
`/status`. The schema in `state.json` is intentionally cheap so a
stale read is at worst confusing, never destructive.

```json
{
  "branch": "fix/login-redirect",
  "lastAction": "pr-opened",
  "prNumber": 42,
  "prUrl": "https://github.com/owner/repo/pull/42",
  "timestamp": "2026-08-30T12:34:56Z"
}
```

## Field rules

| Field | Type | Required | Notes |
|---|---|---|---|
| `branch` | string | yes | Always `<branch>`. Used to confirm the entry matches the current branch — `/status` ignores entries for other branches. |
| `lastAction` | string | yes | One of `branched`, `committed`, `pr-opened`, `watched-green`, `merged`, `abandoned`. See below. |
| `prNumber` | integer | when applicable | Set on `pr-opened`, `watched-green`, and `merged`. Absent otherwise. |
| `prUrl` | string | when applicable | Set on `pr-opened`, `watched-green`, and `merged`. Absent otherwise. |
| `timestamp` | string | yes | ISO-8601 UTC, set every write. |

## `lastAction` values

| Value | Written by | Meaning |
|---|---|---|
| `branched` | `/branch` or step 1 | A fresh `<branch>` branch was created from the default branch. No commits yet. |
| `committed` | step 2 | The user (or the agent) committed work on the branch. Local check has not run yet. |
| `pr-opened` | step 3 | The branch is pushed to `origin` and a PR is open. Push and PR opening are a single step; the value covers both. `prNumber` and `prUrl` are set. |
| `watched-green` | step 4 | Required CI checks reached a terminal green state. PR is ready to merge. |
| `merged` | step 5 | The PR was merged. The remote branch may still exist depending on `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH`. |
| `abandoned` | `/back-to-main` | The branch was discarded. The remote ref may still exist unless `--delete-remote` was passed. |


### Why `pushed` is not a separate value

In the main procedure, step 3 runs `git push` and `gh pr create`
together. The state file therefore only needs one value for "the PR
is open on the remote." A separate `pushed` value would only matter
if `/pr` could legitimately open a PR without pushing, or if some
slash command pushed without opening a PR — neither is supported.
If you add such a command, introduce the value here at the same time
and update the smoke test that greps for the enum.
## What the workflow does NOT persist

- The local check result — that lives in `.git/kimi-git-flow/local-check.json` (see `local-check.md`).
- The PR's CI check states — those come from `gh pr checks --json name,state` at read time.
- Anything per-session in memory. State survives across sessions because it is on disk.

## Housekeeping

- `/merge` overwrites the entry with `merged` and clears `prNumber`/`prUrl` is not done — the values stay so `/status` can show the merge commit. (This is intentionally lenient; the field is informational.)
- `/back-to-main` overwrites the entry with `abandoned` but does not delete the file. A future run on the same branch overwrites it.
- No automatic cleanup. The file is tiny (one JSON object) and stays under `.git/`.

## Why a JSON file and not a git note

`git notes` would survive pushes and clones, but the workflow state is
intentionally local: it tells the user what *their* copy of the
workflow did, not what the repo's history says. A local JSON file
under `.git/` is the right boundary.
