# kimi-git-flow

![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Platform](https://img.shields.io/badge/platform-Kimi_Code-7e57c2)
![GitHub](https://img.shields.io/badge/github-cbuntingde%2Fkimi--git--flow-181717?logo=github)

A Kimi Code plugin that turns every code change into a clean, reviewable
update on GitHub. Ask Kimi for a change in plain English — it creates an
isolated line of work, opens a review request, waits for your automated
checks to pass, and lands the change for you.

## What you get

- **Isolated changes by default.** Every request gets its own line of
  work (a branch), so unrelated changes never get tangled together.
- **Automatic review requests.** Kimi opens a GitHub pull request with a
  description and pushes the change for review.
- **Hands-off landing.** The plugin waits for your automated checks (the
  tests and other checks GitHub runs on your behalf) to pass, then lands
  the change and switches your workspace back to the main line of work.
- **Remote branches kept by default.** After a change lands, its branch
  stays on GitHub so you can revisit, audit, or point someone at the
  exact line of work it came from.

## Install

Run this in a Kimi Code session:

```bash
/plugins install https://github.com/cbuntingde/kimi-git-flow
```

Then reload and confirm:

```bash
/reload
/plugins info kimi-git-flow
```

## Requirements

- `git` available on your `PATH`.
- `gh` (the GitHub command-line tool) installed and signed in. Confirm
  with:

  ```bash
  gh auth status
  ```

- A git repository hosted on GitHub.

## Quick start

1. Ask Kimi to make a change, for example: *"rename the login function
   to `authenticate`"*.
2. Kimi creates an isolated branch, commits the change, and opens a
   review request on GitHub.
3. Kimi waits for your automated checks to pass, lands the change, and
   returns your workspace to the main line of work.

That's it. You can keep working while the change is reviewed and merged
in the background.

## Commands

If you want finer control, the plugin exposes the following slash
commands. Most users won't need them — Kimi uses the full workflow
automatically when you ask for a change.

| Command | What it does |
|---|---|
| `/kimi-git-flow:branch <name>` | Create an isolated branch and stop. Use when you want to set up a line of work before describing the change. |
| `/kimi-git-flow:pr` | Push the current branch and open a review request. |
| `/kimi-git-flow:watch` | Wait for the automated checks to pass. |
| `/kimi-git-flow:merge` | Land the change and return your workspace to the main line of work. |
| `/kimi-git-flow:status` | Show the current branch, review-request URL, and check status. Read-only. |
| `/kimi-git-flow:back-to-main` | Abandon the current branch and return to the main line of work. |

## Configuration

All settings are optional. The defaults work for most repositories.

| Variable | Default | What it does |
|---|---|---|
| `KIMI_GIT_FLOW_WATCH_TIMEOUT_MIN` | `30` | How long, in minutes, to wait for automated checks before giving up. |
| `KIMI_GIT_FLOW_MERGE_STRATEGY` | `squash` | How to land the change. `squash` collapses it into one commit; `rebase` keeps every commit; `merge` adds a merge commit. |
| `KIMI_GIT_FLOW_DELETE_REMOTE_BRANCH` | `0` | Set to `1` to delete the branch on GitHub after the change lands. Default `0` keeps it. |
| `KIMI_GIT_FLOW_BASE_BRANCH` | _(auto-detect)_ | Override which branch counts as the main line of work. |

## Limitations

- **GitHub only.** This version works with GitHub repositories hosted on
  github.com. Other hosts (GitLab, Bitbucket, self-hosted GitHub
  Enterprise) are not supported in this release.
- **One change at a time.** The plugin handles a single change end to
  end before starting the next. If you ask for several changes, they
  run one after another.
- **No background hooks.** The plugin only runs when you invoke it or
  when Kimi uses it on your behalf.

## License

Apache-2.0.
