# Branch naming

A project's branch-naming convention is resolved at branch-creation time,
in this order:

1. **Documented convention.** If the repository documents a branch-naming
   rule (a contributing guide, a git-workflow doc, etc.), follow it
   exactly.
2. **Inferred from history.** Otherwise, infer the convention from the
   dominant pattern in the repository's recent branch names (e.g.
   `git branch -r`, or `gh pr list --json headRefName`).
3. **Generic fallback.** Otherwise, fall back to `<type>/<slug>`, where
   `<type>` is a short category such as `feature/`, `fix/`, or `docs/`.

Never impose a tool-specific prefix (such as the tool's own name) on the user's
repositories — the branch name must fit the project, not this workflow.

## Slug rules

The `<slug>` portion is normalized the same way regardless of which
convention was resolved. Any `<type>/` prefix comes from the convention,
not from the slug:

1. **Lowercase.** ASCII only; no Unicode normalization.
2. **Kebab-case.** Spaces become `-`. Strip all characters outside
   `[a-z0-9-]`. Collapse runs of `-`.
3. **Cap at 48 characters.** Beyond that, drop whole words from the right
   until it fits. Never truncate mid-word.
4. **No trailing dash.** Trim trailing `-`.

## Computing the slug from the user's request

Take the first one or two noun phrases from the user's words. Examples:

| User says | Slug |
|---|---|
| "rename `foo` to `bar`" | `rename-foo-to-bar` |
| "fix the login redirect bug" | `fix-login-redirect` |
| "add a /healthz endpoint" | `add-healthz-endpoint` |
| "phase 2: rbac" | `phase-2-rbac` |
| "refactor the error types in `src/errors.rs`" | `refactor-error-types` |

## Resolving the branch name

Combine the resolved convention with the normalized slug:

| Situation | Resolved branch |
|---|---|
| The repo's `CONTRIBUTING.md` says branches look like `feature/<topic>` | `feature/add-healthz-endpoint` |
| No doc; recent branches are `fix/...` and `chore/...` | `fix/login-redirect` |
| No doc, no clear history | `feature/add-healthz-endpoint` |

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

If the resolved branch name already exists (locally or on `origin`):

1. Try `<branch>-2`, then `-3`, `-4`, ...
2. The first one that `git checkout -b` accepts is the winner.
3. Surface the resolved name in the user's chat ("created branch
   `fix/login-redirect-2` because the original exists").

Stop after `-9` and ask the user to pick a different slug.

## What NOT to do

- Do not impose a tool-specific prefix (such as the tool's own name) on the user's
  repositories. The branch name follows the project's own convention.
- No author names, no ticket IDs, no dates in the slug.
- No reusing a slug for an unrelated change. Each task gets its own
  branch.
