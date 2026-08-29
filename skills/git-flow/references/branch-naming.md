# Branch naming

Every branch in this workflow follows one rule: `kimi/<slug>`.

## Slug rules

1. **Lowercase.** ASCII only; no Unicode normalization.
2. **Kebab-case.** Spaces become `-`. Strip all characters outside
   `[a-z0-9-]`. Collapse runs of `-`.
3. **Strip leading `kimi/`.** If the user's words already include the
   prefix, don't double it.
4. **Cap at 48 characters.** Beyond that, drop whole words from the right
   until it fits. Never truncate mid-word.
5. **No trailing dash.** Trim trailing `-`.

## Computing the slug from the user's request

Take the first one or two noun phrases from the user's words. Examples:

| User says | Slug |
|---|---|
| "rename `foo` to `bar`" | `rename-foo-to-bar` |
| "fix the login redirect bug" | `fix-login-redirect` |
| "add a /healthz endpoint" | `add-healthz-endpoint` |
| "phase 2: rbac" | `phase-2-rbac` |
| "refactor the error types in `src/errors.rs`" | `refactor-error-types` |
| "kimi: rename foo to bar" | `rename-foo-to-bar` (the `kimi:` prefix is stripped) |

## Conventional-commit subject (used in the commit message, not the branch)

`<type>(<scope>): <subject>`

- **type**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`,
  `build`, `ci`.
- **scope** (optional): one short noun — module, package, or layer.
- **subject**: imperative, lowercase, no period, ≤ 72 chars.

Examples:

- `fix(auth): handle expired refresh tokens`
- `feat(api): add /healthz endpoint`
- `refactor(errors): collapse duplicate variants`

## Collision handling

If `kimi/<slug>` already exists (locally or on `origin`):

1. Try `kimi/<slug>-2`, then `-3`, `-4`, ...
2. The first one that `git checkout -b` accepts is the winner.
3. Surface the resolved name in the user's chat ("created branch
   `kimi/fix-login-redirect-2` because the original exists").

Stop after `-9` and ask the user to pick a different slug.

## What NOT to do

- No `feature/`, `bugfix/`, `hotfix/` prefixes — keep everything under
  `kimi/` so a single branch listing surfaces only this workflow's
  branches.
- No author names, no ticket IDs, no dates in the slug.
- No `/` after `kimi/` — Git refs disallow nested directories and the
  workflow has no use for them.
- No reusing a slug for an unrelated change. Each task gets its own
  branch.