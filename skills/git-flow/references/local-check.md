# Local check (step 2.5)

When a repo has no remote CI configured, the workflow still runs the
equivalent of CI on the working tree before pushing. This catches build
and test failures locally so the user gets the same signal they'd get
from `gh pr checks --watch` on a repo with branch protection.

The local check is **observation, not gating on the skill layer**: it
aborts the workflow on failure (same as a red CI check), but it never
modifies commits and never rewrites the runner's output.

## When this runs

Step 2.5 of the main procedure (`skills/git-flow/SKILL.md`), between committing

It runs **once per workflow invocation against the current working
tree**, i.e. the state of the branch as last committed (step 2) or
as last amended. A follow-up commit on the same branch does not
automatically re-trigger the check inside the same run — but a
*new* workflow run on the same branch (e.g. the user runs
`/kimi-git-flow:pr` again to push a follow-up, or `/merge` re-reads
the result) sees the fresh working tree and re-executes the runner
from scratch. Cached results across runs are not honoured.

## When this is skipped

- `KIMI_GIT_FLOW_SKIP_LOCAL_CHECK=1` → skip silently.
- The working tree has zero diff vs. the default branch (e.g. user
  invoked `branch` without doing any work yet) → skip with a
  one-liner.
- No stack is detectable (none of the markers below match) → skip with
  `local check: skipped (no detectable stack)`.

## Detection matrix

First match wins. Detection is shallow: each marker is a single
`test -f` / `grep` against the working tree root.

| Marker                              | Stack  | Command                                                       |
|-------------------------------------|--------|---------------------------------------------------------------|
| `package.json` with `"scripts.test"` | node   | `npm test --if-present` (or `pnpm test` if `pnpm-lock.yaml`, `yarn test` if `yarn.lock`) |
| `pyproject.toml` or `setup.py`      | python | `pytest -q` (fallback: `python -m unittest discover -s tests`) |
| `Cargo.toml`                        | rust   | `cargo test --quiet`                                          |
| `go.mod`                            | go     | `go test ./...`                                               |
| `Makefile` containing `^test:`      | make   | `make test`                                                   |
| none                                | none   | skip                                                          |

Lockfile precedence for Node: `pnpm-lock.yaml` → `pnpm test`;
`yarn.lock` → `yarn test`; otherwise `npm test --if-present`. This
matches the user's actual install path and avoids running the wrong
package manager against a stale lockfile.

## Runner choices — why each one

- **`npm test --if-present`** — matches the default `npm test`
  convention; falls through silently when the project has no `test`
  script in `package.json`. Honors the user's npm config.
- **`pytest -q`** — the de facto Python test runner. Falls back to
  `unittest discover` only when `pytest` is not on PATH, so projects
  that have vendored pytest still get their actual runner.
- **`cargo test --quiet`** — the only Rust test runner. `--quiet`
  suppresses the per-test compile spam in the local output; on failure
  the full panic output is preserved.
- **`go test ./...`** — the canonical Go test command. No flags.
- **`make test`** — generic escape hatch for any project whose tests
  aren't covered above.

## Timeout

Default 300 seconds per check. Override with
`KIMI_GIT_FLOW_LOCAL_CHECK_TIMEOUT` (in seconds). Long enough for a
slow cold `cargo test`, short enough not to hang the workflow forever.
On timeout, the check is reported as `fail` with a one-line reason
(`local check timed out after 300s`).

## Result format

Print exactly one line, never a paragraph:

```
local check: stack=<node|python|rust|go|make|none> command="<cmd>" result=<pass|fail|skipped> duration=<Ns>
```

On `fail`, also print the last 50 lines of the runner output, then
abort with the standard abort-message format from
`references/safety.md`:

```
aborted: local check failed. stack=<stack> command="<cmd>". Fix the failing test, then re-run the workflow.
```

Do **not**:

- Retry the runner. The user retries.
- Interpret the output (no "looks like a flaky test" judgment).
- Pass through the runner's full stdout unless it failed. A 5,000-line
  successful `cargo test` log is not useful.
- Cache results across runs. Every workflow run re-executes the runner
  against the current working tree.

## Recording the result

The skill writes the result to
`.git/kimi-git-flow/local-check.json` (gitignored). Schema:

```json
{
  "branch": "kimi/<slug>",
  "stack": "node",
  "command": "npm test --if-present",
  "result": "pass",
  "duration": 12,
  "timestamp": "2026-XX-XXTHH:MM:SSZ"
}
```

This file is read by `/kimi-git-flow:status`, `/kimi-git-flow:watch`,
and `/kimi-git-flow:merge` so the user can see what was checked even
when remote CI is absent. Never committed; never pushed.
