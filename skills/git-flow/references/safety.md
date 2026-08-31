# Safety rules

The workflow refuses to operate when any of these are violated. Every
rule has a clear, user-visible abort message.

## Hard rules (never violated)

1. **No force-push to the default branch.** `git push --force` against
   `<default-branch>` is forbidden. If the user asks for it, abort and
   tell them to do it themselves.
2. **No `--admin` on `gh pr merge`.** If branch protection blocks the
   merge, surface the missing requirement and stop. The user runs
   `--admin` manually if they really mean it.
3. **No merging with red CI.** If any required check is failing or
   pending, refuse. Even one failing check blocks the merge.
4. **No operating without `gh auth`.** Run `gh auth status` at the start
   of every workflow run. If it fails for the relevant host, abort.
5. **No operating on a dirty working tree.** Uncommitted changes block
   the start of a new branch. Offer `git stash` or "commit your existing
   changes first" and wait.
6. **No co-mingling unrelated changes.** One task per branch. If a user
   asks to fix bug A and add feature B, the workflow creates two
   branches and runs the workflow twice.
7. **No reusing a branch.** A branch that has already merged is dead.
   If the user wants the same change again, they get a new branch with a
   `-2` suffix.
8. **No `--force` on `--delete-branch`.** Deleting a remote branch that
   has unmerged commits is fine (the merge is what deletes it), but
   `git push origin --delete <branch>` against a branch with unmerged
   commits is forbidden unless the user explicitly approves.
   The `/kimi-git-flow:back-to-main --delete-remote` flag is the
   one place this approval is granted. **Typing `--delete-remote` is
   the explicit approval.** The workflow refuses to add
   `--delete-remote` on its own initiative, refuses to delete a
   remote branch that has more than one commit ahead of the default
   branch unless the flag is present, and prints a one-line warning
   when the branch is shared (more than one commit ahead) so the
   user can rescind before the push fires. See
   `commands/back-to-main.md` and rule 4 in the soft-rules section
   below for the warning contract.
9. **No skipping the watch step.** Even if the user says "CI is fine,
   just merge", the workflow still runs `gh pr checks --watch` once
   before merging. The user can pass `--no-verify` style intent by
   saying so explicitly, but the workflow always confirms green.
10. **No `--no-verify` on commits.** Standard `git commit` only — no
    `--no-verify` to skip hooks, unless the user explicitly approves.

## Soft rules (warn but proceed)

1. **Empty PR body.** The workflow falls back to `gh pr create --fill`
   rather than blocking.
2. **Branch protection has no required checks.** Warn once, then
   proceed. The user can tighten protection later.
3. **Merge commit subject is longer than 72 chars.** Warn and proceed.
4. **`git pull --ff-only` fails after merge.** Probably means a remote
   commit landed during the CI wait. Surface the divergence and stop —
   the user decides whether to rebase, merge, or reset.

## Abort message format

When the workflow aborts, print exactly one line in this shape:

```
aborted: <rule that fired>. <one-line explanation>. <next step for the user>.
```

Examples:

- `aborted: dirty working tree. Commit or stash your changes before starting a new branch.`
- `aborted: gh not authenticated for github.com. Run \`gh auth login --hostname github.com\` and retry.`
- `aborted: failing CI check. "build (ubuntu-latest)" failed in run https://github.com/.../actions/runs/123. Fix the check or push a follow-up commit.`
- `aborted: branch protection requires 1 approving review. Ask a reviewer to approve PR #42 before merging.`

Never bury the abort reason in a paragraph. One line, scannable.

## Audit trail

Every workflow run prints, at the start:

```
kimi-git-flow: branch=kimi/<slug> base=<default> strategy=<squash|rebase|merge> timeout=<n>m
```

Every workflow run prints, at the end (success or failure):

```
kimi-git-flow: result=<merged|aborted|timeout> pr=<#n|url> checks=<green|red|timeout> branch=<kimi/<slug>>
```

The user can grep `~/.kimi-code/logs/kimi-code.log` for `kimi-git-flow:`
to reconstruct the run history.