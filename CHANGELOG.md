# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
