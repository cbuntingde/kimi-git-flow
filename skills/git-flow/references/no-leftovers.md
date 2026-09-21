# Nothing left behind

One branch at a time, and it runs all the way to merged before the next
one starts. This file is the contract for that, and the two points at
which it is checked.

```
create  ->  commit  ->  push + pull request  ->  local check  ->  merge  ->  back to default
```

## The ordering rule

**A branch created by this workflow runs from creation to merged, or it
is explicitly abandoned, before any other branch begins.**

Nothing starts a second branch while the first is open. Not a related
fix, not a documentation tweak, not "while I am in here". Two open
branches mean two changes that have to be reasoned about together, and
the one that gets lost is whichever was less interesting.

This is checked in step 0, before the branch is created. If the check
fires, the answer is to finish the branch that is already open — not to
start another one alongside it.

## The three states a branch can be in

| State | What it means | What is required |
|---|---|---|
| **Merged and deleted** | The normal ending, and the only one that needs no explanation. | Push, open the pull request, pass the local check, merge, delete the local branch, return to the default branch. |
| **In progress, with an open pull request** | The session ended before the work did. A *pause*, not an ending, and it **blocks the next branch**. | Committed, pushed, pull request open, and named in the summary as unfinished. Resume it before starting anything else. |
| **Abandoned, by the user's decision** | The work turned out to be wrong or unnecessary. | The user decides. The branch is deleted, the remote ref is dealt with, and the reason is recorded. Never the agent's call. |

A branch that is in none of those three states — not merged, not in
progress, not deleted, and not mentioned — is the failure this file
exists to prevent. Silent is the problem, not unfinished.

## Before starting: is anything already open?

Runs as preflight step 0g, before the branch is created.

```bash
# Nothing but the default branch may exist.
other_branches=$(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -vx "$DEFAULT_BRANCH")
if [ -n "$other_branches" ]; then
  echo "aborted: a branch is already open. Finish or abandon it before starting another:"
  echo "$other_branches"
  exit 1
fi

# No pull request may be waiting to land.
open_prs=$(gh pr list --state open --json number,headRefName -q '.[] | "#\(.number) \(.headRefName)"')
if [ -n "$open_prs" ]; then
  echo "aborted: a pull request is already open. Finish it before starting another branch:"
  echo "$open_prs"
  exit 1
fi
```

A branch that exists only because the user manages it by hand still
fires this check. The abort names it, and the user decides whether it is
finished, abandoned, or theirs to keep — the workflow does not delete
something it did not create.

## Before finishing: is anything left behind?

Runs at the end of every workflow run, success or abort, and the result
goes in the summary.

```bash
git status --porcelain                  # must print nothing
git branch                              # must list the default branch and nothing else
git log --oneline origin/main..main     # must print nothing — the default branch is not ahead
git stash list                          # must print nothing
```

Any output is a stop, not a warning.

The second line is the one that used to lie. Step 6 deleted the branch
with `git branch -d <branch> 2>/dev/null || true`, and `-d` refuses to
delete a branch that is not fully merged — so a failed step 5 left the
branch in place and the `|| true` hid it. The delete is now unsilenced:
a refusal is the only signal that the merge never landed, and it is
reported rather than swallowed.

## Never local-only

**On any abort after the commit, push the branch before stopping.**

A failed local check, a failed `gh pr create`, an unanswered question —
the commit already exists, so it must also exist on `origin`. An
unpushed branch is work that lives in exactly one place, on one disk,
and it is indistinguishable from work that was never done. Step 2.5 and
step 3 both push before they hand control back.

The same rule covers the working copy. A pull-request body, an exported
log, a throwaway script: outside the repository, or through a pipe
(`gh pr create --body-file -` reads from stdin). If one has to exist on
disk, it is removed in the same turn it was created.

## What this does not do

- It does not delete a branch the workflow did not create. It reports
  the branch and stops.
- It does not delete a remote branch that has unmerged commits. That is
  rule 8 in `references/safety.md`, and `/back-to-main --delete-remote`
  is the only place the approval is granted.
- It does not merge a branch to clear the check. The check exists
  because the work was not finished, and merging is the finishing.
