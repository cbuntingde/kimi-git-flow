# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **A Bun project silently ran `npm test` instead of its own `verify`
  gate.** The step 2.5 detection matrix had no Bun row and the lockfile
  precedence knew only `pnpm-lock.yaml` and `yarn.lock`, so a project
  carrying `bun.lock` with a `scripts.verify` definition of done fell
  through to the generic node row and ran a *subset* of its real gate.
  Because step 2.5 is the merge gate when Actions is unavailable, that
  made the gate silently weaker than the project's own definition of
  done. Bun is now detected first, keyed on `bun.lock` / `bun.lockb`,
  and runs `bun run verify` when `scripts.verify` is declared, falling
  back to `bun test` so a missing `verify` script is not reported as a
  failure.

- **`npm run lint:links` ran the whole suite.** `--test-name-pattern` placed
  after the test-file path is ignored by Node, so the script was no faster than
  `npm test`. The flag now precedes the path, and a guard asserts the ordering
  and that the pattern matches at least one test name.

- **The smoke test's `lastAction` enum check never inspected `SKILL.md` or
  `status.md`.** The regex anchored each value to the first table cell, so only
  `state.md` was covered — and deleting a required value still passed, because
  the check only rejected unknown values. `state.md` now defines the enum and
  every consuming doc must agree with it. The command and reference manifests
  are derived from disk instead of hand-maintained, so a newly added file can
  no longer escape the structural checks. `slug()` refuses to return an empty
  slug, and the language-filter token is shape-checked and escaped before it
  reaches a `RegExp`.

### Security

- **Preflight could silently skip the unpushed-commits guard.** When the
  remote-tracking ref did not exist yet, `git log` exited 128 with empty output
  and the guard read an empty string, passing — defeating safety rule 12 on a
  fresh clone. Preflight now fetches and verifies `origin/<default-branch>`
  before the check, aborts on an empty detected default branch, and aborts
  explicitly on each failed check instead of relying on exit statuses nobody
  reads. An unrecognized `KIMI_GIT_FLOW_MERGE_STRATEGY` now aborts rather than
  silently falling back to squash.

## [0.3.0] — 2026-09-19

### Security

- **CI installed unpinned packages and had no least-privilege token.** A
  `package-lock.json` was never committed, so `npm ci || npm install` always
  fell through to an unpinned `npm install` — and the smoke guard passed on the
  substring. The workflow now runs a bare `npm ci` against a committed
  lockfile, declares `permissions: contents: read`, and the `setup-ci`
  templates gain the same `permissions` block.

### Fixed

- **Step 0 quotes its ref expansions.** Hygiene rather than a security fix:
  git already rejects refnames containing whitespace or glob characters, and a
  shell variable's contents are never re-expanded, so no live injection path
  existed. The quoting is kept as defense in depth.
- **`slug()` violated the documented cap rule.** The test harness truncated at
  48 chars mid-word (`.slice(0, 48)`) and asserted `!startsWith("kimi")`,
  neither of which is in `references/branch-naming.md`. It now drops whole
  words and asserts only the documented invariants. A duplicate lenient
  frontmatter parser was also removed; the strict parser is the single
  contract.
- **Documented env vars were no-ops.** `KIMI_GIT_FLOW_MERGE_STRATEGY` and
  `KIMI_GIT_FLOW_BASE_BRANCH` were documented but never read; step 5 now maps
  the strategy and step 0 honors the base-branch override.

### Added

- `references/safety.md` rule 11 (no silent revert): the workflow must
  not invoke `git checkout -- <path>`, `git reset --hard`,
  `git stash drop` / `git stash clear`, or `git clean -fd` during
  steps 1–5 without explicit user approval. The single sanctioned
  use of `git reset --hard` is in step 6 when every local commit on
  the current branch is already reachable from
  `origin/<default-branch>` — see soft-rule 4 for the exact gate.
- `references/safety.md` rule 12 (no branching off a divergent
  default branch): step 0 preflight now refuses to proceed if the
  local default branch is ahead of `origin/<default-branch>` by any
  number of unpushed commits. The user is shown the exact
  commands and the workflow stops. Preflight now prints the
  exact commit list of unpushed commits (so the user can decide
  whether they are worth keeping) instead of just refusing.

- `lastAction` enum no longer includes `pushed`. Push and PR opening are
  step 3 in the main procedure, so `pr-opened` covers both. `state.md`
  now spells out the rationale.
- Dogfooded `.github/workflows/ci.yml` now pins `actions/checkout` and
  `actions/setup-node` to a specific minor version (`@v4.2.2` and
  `@v4.1.0`). A silent upgrade of `actions/*` can no longer change
  test behavior under our feet. A committed `package-lock.json` and a
  bare `npm ci` (see the Security entry above) replace the earlier
  `npm ci || npm install` fallback, which never honored a lockfile
  because none was committed.
- `references/safety.md` rule 8 now spells out the
  `/kimi-git-flow:back-to-main --delete-remote` approval contract:
  typing the flag is the explicit approval, the workflow refuses to
  add it on its own, and prints a one-line warning on shared
  branches. The previous wording left the contract implicit in
  `commands/back-to-main.md`.

### Added

- `--dry-run` flag on `/kimi-git-flow:branch`, `/kimi-git-flow:pr`,
  and `/kimi-git-flow:merge`. Each command's Usage section documents
  the flag, which runs preflight + step 2.5 (where applicable) but
  prints the exact `git`/`gh` invocations instead of running them.
- `skills/git-flow/references/state.md` adds a "Scope" subsection
  documenting that the file is shared across clones, worktrees, and
  detached-HEAD reads, and that `/status` may show stale data in
  those situations.
- `commands/watch.md` and `commands/merge.md` now print the exact
  abort message and recovery command (`/kimi-git-flow:pr`) when
  invoked with no PR open. Previously the user got a dead-end
  `gh pr view` failure with no recovery path.
- New `npm run lint:links` script for fast link-only feedback during
  documentation edits.
- New smoke tests:
  - `lastAction` table cells in `state.md`, `SKILL.md`, and `status.md`
    are grep-guarded against the canonical enum; a second test pins
    the dropped `pushed` value as forbidden.
  - Reference files cannot be orphaned — every `references/*.md` must
    have at least one inbound link from SKILL.md or a command.
  - The dogfooded CI workflow's pinned `actions/*` versions and
    `npm ci` install are guarded against silent drift.
  - `branch.md`, `pr.md`, `merge.md` must document `--dry-run` in
    their Usage section so a length-trim edit cannot drop the audit
    path.
  - `commands/merge.md` must cross-link `references/state.md`
    because it reads the state file.
  - `commands/watch.md` and `commands/merge.md` must mention
    `/kimi-git-flow:pr` as the recovery path.

### Fixed

- **Invalid YAML frontmatter silently disabled the plugin.** `skills/git-flow/SKILL.md`
  and `commands/setup-ci.md` had an unquoted `description` value containing a
  colon followed by a space (`... workflow: fresh ...`, `... opt-in: scaffold ...`).
  YAML reads that as a nested mapping, so the host logged `Skipping invalid skill`
  and dropped the skill. Because the plugin's only auto-run mechanism is
  `sessionStart.skill`, the plugin stopped running on session start entirely.
  Both descriptions are now quoted.
- **Frontmatter lint.** The smoke suite now validates every `SKILL.md` and
  `commands/*.md` frontmatter with a strict parser that rejects
  host-rejectable constructs (unquoted `: `, a trailing `:`, or an unquoted
  ` #`), pinned with a regression test for the exact construct that caused the
  outage. The previous lenient `parseFrontmatter` could not distinguish valid
  YAML from frontmatter the host would reject.

## [0.2.0] — 2026-08-29

### Added
- Local check step (2.5): automatically detects the project's stack
  (Node, Python, Rust, Go, Make) and runs the equivalent of CI locally
  before pushing. Configurable via `KIMI_GIT_FLOW_SKIP_LOCAL_CHECK` and
  `KIMI_GIT_FLOW_LOCAL_CHECK_TIMEOUT`. See
  `skills/git-flow/references/local-check.md`.
- New slash command `/kimi-git-flow:setup-ci` that scaffolds a minimal
  `.github/workflows/ci.yml` matching the detected stack, requires
  explicit user approval before committing, and opens a PR. Opt-in only
  — never auto-runs. See `skills/git-flow/references/setup-ci.md`.
- `/status` now reports the most recent local-check result per branch
  (read from `.git/kimi-git-flow/local-check.json`).
- `/watch` and `/merge` print the local-check summary when remote CI is
  absent; `/merge` refuses if the recorded local-check result is `fail`.

### Notes

- The local check is observation, not gating: it aborts the workflow on
  failure (same as a red CI check) but never modifies commits.

## [0.1.0] — 2026-08-29

### Added

- Initial release of the kimi-git-flow Kimi Code plugin.
- Branch-per-change workflow: creates a fresh `kimi/<slug>` branch, commits
  the change, opens a pull request via `gh pr create --fill`, waits for
  required checks, lands the change, and switches the working copy back
  to the default branch.
- Slash commands for fine-grained control: `/branch`, `/pr`, `/watch`,
  `/merge`, `/status`, `/back-to-main`.
- Optional environment variables for tuning the workflow:
  `KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN`, `KIMI_GIT_FLOW_MERGE_STRATEGY`,
  `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH`, `KIMI_GIT_FLOW_BASE_BRANCH`.
- Remote branch is kept by default after merge; set
  `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH=1` to opt back into remote deletion.
- Apache-2.0 license.
