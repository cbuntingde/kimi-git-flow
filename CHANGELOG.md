# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `lastAction` enum no longer includes `pushed`. Push and PR opening are
  step 3 in the main procedure, so `pr-opened` covers both. `state.md`
  now spells out the rationale.
- Dogfooded `.github/workflows/ci.yml` now pins `actions/checkout` and
  `actions/setup-node` to a specific minor version (`@v4.2.2` and
  `@v4.1.0`). A silent upgrade of `actions/*` can no longer change
  test behavior under our feet. The workflow also installs with
  `npm ci || npm install` so it honors the lockfile the same way
  `references/local-check.md` does.
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
