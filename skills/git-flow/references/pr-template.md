# PR body template

Use this template for `gh pr create --body-file`. For trivial changes
(single-line fixes, typo corrections), drop to `--fill` instead — the
auto-generated body is fine.

## Template

```markdown
## Summary

<One or two sentences describing what changed and why.>

## Changes

- <bullet>
- <bullet>
- <bullet>

## Test plan

- [ ] <test 1 — what was verified and how>
- [ ] <test 2>
- [ ] <test 3>

## Risk

<Low / Medium / High with one-line justification. Low is the default —
say so explicitly when the change touches auth, payments, persistence,
or a public API contract.>
```

## Sections, when to include each

- **Summary** — always. One or two sentences.
- **Changes** — always for non-trivial PRs. Skip for single-file typo
  fixes.
- **Test plan** — always. Even one checkbox ("`cargo test` passes
  locally") is better than nothing.
- **Risk** — always. If Low, say "Low — no public surface change."

## What the workflow fills in automatically

- **Title**: derived from the branch slug with any `type/` prefix
  stripped and kebab-case → Title Case. Example: `fix/login-redirect`
  → `Fix Login Redirect`.
- **Base branch**: from `gh repo view --json defaultBranchRef`.
- **Head branch**: the current branch.

## Examples

### Small fix

```markdown
## Summary

Fixes a 500 returned by `/api/v1/auth/refresh` when the refresh token
has been rotated server-side but the client still holds the old value.

## Changes

- Catch `RefreshTokenRotated` in the auth handler and re-issue a fresh
  pair instead of bubbling the error.

## Test plan

- [ ] `cargo test -p api auth::refresh` passes
- [ ] Manual: rotate the user's refresh token, hit `/refresh`, confirm
  a new pair is returned.

## Risk

Low — narrows an existing error path; no new public surface.
```

### Multi-phase work

```markdown
## Summary

Phase 2 of the RBAC rollout: replaces the role check in
`middleware/auth.rs` with the new policy evaluator.

## Changes

- Swap `require_role(...)` for `policy::evaluate(...)` at the three
  call sites identified in phase 1.
- Delete the now-unused `require_role` helper.
- Add property tests covering each call site.

## Test plan

- [ ] `cargo test --all-features` passes
- [ ] `cargo clippy -- -D warnings` passes
- [ ] Manual: walk through the role matrix in `docs/rbac.md` against a
  staging deploy.

## Risk

Medium — touches every authenticated endpoint. Rollback plan: revert
this PR; the old helper is restored by the revert commit.
```