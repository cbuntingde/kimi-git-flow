# CI watch semantics

This workflow waits for required CI checks with `gh pr checks --watch`.
This file documents exactly what counts as "green" and what to do when
things go sideways.

If the repository cannot run Actions at all, there is nothing to wait
for — read "Actions unavailable on this account or repo" below and use
the step 2.5 local check as the gate.

## The canonical invocation

```bash
# Read the timeout from env, defaulting to 30 minutes.
WATCH_TIMEOUT_MIN="${KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN:-30}"

timeout "${WATCH_TIMEOUT_MIN}m" \
  gh pr checks --watch --interval 30
```

`--watch` blocks until every required check has reached a terminal state
(success, failure, or cancelled). `--interval 30` re-polls every 30
seconds.

## Exit codes from `gh pr checks --watch`

| Exit | Meaning | Workflow action |
|---|---|---|
| 0 | All required checks passed. | Proceed to merge. |
| 1 | One or more required checks failed. | Surface the failing check name and the run URL. **Do not merge.** |
| 8 | `gh` itself errored (network, auth). | Re-run once; if it persists, surface the `gh` error to the user. |
| 124 (from `timeout`) | The wall-clock deadline fired before all checks resolved. | Leave the PR open, tell the user, stop. |

## What "required" means

`gh pr checks` reports **all** checks — required and optional. The
workflow treats every reported check as required for the purpose of the
green/green merge decision. If the user wants to skip an optional check
(e.g. a flaky `codecov/patch` check), they must say so explicitly before
the merge runs. There is no automatic skip.

## Actions unavailable on this account or repo

Actions is only available where the account's plan and the repository
settings allow it. Confirm a run can actually happen before waiting on
one:

```bash
gh api "repos/{owner}/{repo}/actions/permissions" -q .enabled
```

`false` — or a `404`/`403` from `gh api` — means no workflow will ever
report on this pull request. There is nothing to wait for, so use the
step 2.5 local check as the merge gate instead:

- Do **not** run `gh pr checks --watch`. The watch only delays the
  merge.
- A `pass` or `skipped` local-check result proceeds to step 5.
- A `fail` local-check result aborts exactly as a red check would; the
  merge never runs.

Print one line, so the user can see what the merge rested on:

```
no remote CI: Actions is unavailable for this repository; local check result was <pass|fail|skipped> at step 2.5
```

The local check only covers the stack it detected. When it reports
`skipped`, say which of the `local-check.md` reasons applied — the
change then landed with no automated verification at all, and that
must not be silent.

## Required-checks-not-configured case

If a repo has no branch protection and no required checks, `gh pr
checks` returns an empty list immediately. The workflow treats that as
green and proceeds to merge. Surface a one-line warning to the user:

```
No required checks configured for this branch — proceeding to merge.
```

If the user wants stricter behavior, set up branch protection on the
default branch and re-run.

## Watch unavailable on this `gh` version

`gh pr checks --watch` was added in `gh` 2.40 (Sept 2023). On older
versions, fall back to polling:

```bash
while true; do
  STATE=$(gh pr checks --json state -q '.[] | select(.state != "SUCCESS" and .state != "FAILURE" and .state != "CANCELLED") | .state' | wc -l)
  [ "$STATE" -eq 0 ] && break
  sleep 30
done

# Then check the final state:
gh pr checks --json state -q '.[] | select(.state == "FAILURE")' | grep -q . \
  && { echo "FAILED"; exit 1; } \
  || { echo "GREEN"; exit 0; }
```

The workflow tries `--watch` first and only falls back to polling if
`gh` exits with a "unknown flag" error.

## What the workflow does NOT do

- Does not re-run failed checks. The user does that.
- Does not push follow-up commits to fix a failed check. The user does
  that; the workflow then resumes from step 4 (watch).
- Does not auto-merge after a timeout. The user decides.
- Does not cancel in-progress checks on abort. `gh` has no flag for
  that; in-progress runs finish on the runner side and are simply not
  waited for.