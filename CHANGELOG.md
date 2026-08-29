# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-XX-XX

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

## [0.1.0] — 2026-XX-XX

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
