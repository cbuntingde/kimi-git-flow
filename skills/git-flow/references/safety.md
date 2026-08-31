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
   `commands/back-to-main.md` for the exact flag contract.
9. **No skipping the watch step.** Even if the user says "CI is fine,
   just merge", the workflow still runs `gh pr checks --watch` once
   before merging. The user can pass `--no-verify` style intent by
   saying so explicitly, but the workflow always confirms green.
10. **No `--no-verify` on commits.** Standard `git commit` only — no
    `--no-verify` to skip hooks, unless the user explicitly approves.
11. **No silent revert.** The following commands destroy uncommitted or
    unpushed work without confirmation and are forbidden mid-workflow:

    - `git checkout -- <path>` (reverts tracked files silently).
    - `git reset --hard` (drops uncommitted work AND any local commits
      not yet on `origin/<default-branch>`).
    - `git stash drop` or `git stash clear` (drops the safety net).
    - `git clean -fd` (deletes untracked files silently).

    The workflow **must not** invoke any of these during steps 1–5
    without an explicit user message approving the loss. The single
    sanctioned use of `git reset --hard` is in step 6 (Return to
    default branch) when **every** local commit on the current branch
    is already reachable from `origin/<default-branch>` — see rule 4
    in the soft-rules section for the exact safety gate.

    If the agent finds itself needing to discard local state to make
    progress (e.g. a `git stash pop` produced conflicts, or a `git
    pull --ff-only` failed), it must stop and surface the conflict.
    It does **not** "make the build green by deleting the files that
    conflict." That is exactly the failure mode this rule prevents.
12. **No branching off a default branch that has unpushed commits.**
    Before step 1 (create the branch), compare the local default
    branch against `origin/<default-branch>`. If local is ahead by
    one or more commits that are not yet on `origin`, refuse with:

    ```
    aborted: local <default-branch> is N commit(s) ahead of origin/<default-branch>. Push, rebase, or drop them before starting a new branch.
    ```

    This is the gate that prevents the agent from "rescuing" the
    user's unmerged work by stashing it (where it can be lost in a
    later 3-way merge conflict), resetting it (where it is lost for
    good), or branching off it (where the branch base no longer
    matches what the user expects on `origin`).

## Soft rules (warn but proceed)

1. **Empty PR body.** The workflow falls back to `gh pr create --fill`
   rather than blocking.
2. **Branch protection has no required checks.** Warn once, then
   proceed. The user can tighten protection later.
3. **Merge commit subject is longer than 72 chars.** Warn and proceed.
4. **`git pull --ff-only` fails after merge.** Probably means a remote
   commit landed during the CI wait. Surface the divergence and stop —
   the user decides whether to rebase, merge, or reset. The exact
   recovery contract is in `SKILL.md` step 6.

   The `git reset --hard` path is sanctioned **only when every local
   commit on the current branch is already reachable from
   `origin/<default-branch>`** (i.e. the local commits exist on
   `origin` already — the reset is purely a local cleanup). Verify
   with:

   ```bash
   git log --oneline origin/<default-branch>..HEAD
   git log --oneline HEAD..origin/<default-branch>
   ```

   Both outputs empty → safe to `git reset --hard origin/<default-branch>`.
   Either output non-empty → stop and ask the user. The user decides
   whether the missing commits are recoverable (rebase/merge) or
   discardable.

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
- `aborted: local main is 1 commit(s) ahead of origin/main. Push (\`git push origin main\`), rebase, or drop before starting a new branch.`
- `aborted: silent revert blocked. \`git reset --hard\` would discard 1 unpushed commit(s). Push, rebase, or drop them before resetting.`

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