# Language filter

Every string this workflow writes into the user's repository history
or onto GitHub must read like a polished sentence. Casual slang and
insider development jargon have no place in a commit subject, a PR
title, or a PR body — those are the durable record of the change, and
they are read by people who were not in the room when the work
happened.

This rule covers three sites:

- **Commit messages** — subject line and body (step 2 and the
  `setup-ci` commit).
- **PR titles** — the `--title` argument to `gh pr create`, plus the
  squash-commit subject that GitHub derives from it.
- **PR bodies** — the markdown rendered from `pr-template.md` and
  passed via `--body-file`.

Branch names are out of scope: the slug rule in
`references/branch-naming.md` already restricts them to
`[a-z0-9-]`, so no blocked term can land there anyway.

## Blocklist

The following tokens are forbidden in any commit subject, PR title,
or PR body. Matching is **case-insensitive** and **whole-word**.

### Casual filler

- `wip`
- `fixup`
- `hack`
- `lol`
- `lmao`
- `tbh`
- `fwiw`
- `ngl`
- `fck`
- `stuff`
- `nope`

### Development slang and jargon

- `bikeshed`
- `bikeshedding`
- `yak-shave`
- `yak-shaving`
- `kludge`
- `hacky`
- `footgun`
- `boilerplate`
- `spaghetti`
- `lgtm`
- `nit`
- `nitpick`
- `rubber-stamp`

A token is "whole-word" when its left and right neighbors are not
word characters (`[A-Za-z0-9_]`). So `wip` inside `wip-policy.md` is
fine (file path, not a word), but `wip on this` is not (it stands
alone). The same rule keeps `nit` out of `unit` and `stuff` out of
`stuffy`.

Where a blocked term would collide with a common identifier the
workflow needs to name, prefer a different entry over carving an
exception into the rule.

## How the workflow applies the rule

Before any of these strings leave the agent:

1. **Commit subject and body** (step 2): check the proposed
   `git commit -m "..."` argument, both subject and body, against the
   blocklist. If a token hits, rewrite the message to remove the
   token and re-check. If rewriting would lose meaning, abort with
   `aborted: commit message contains blocked term "<token>". Rephrase the message and retry.` and let the user pick a new
   wording.
2. **PR title** (step 3, `setup-ci`, and any `gh pr create`
   invocation): same check, same abort shape.
3. **PR body** (step 3, `gh pr create --body-file`): check every
   line of the rendered body. Same abort shape.

The check fires before the `git commit`, `git push`, or `gh pr create`
call fires, so a hit never lands in the repo.

## Why these tokens and not others

Conventional-commit verbs (`feat`, `fix`, `refactor`, `chore`,
`docs`, `test`, `perf`, `build`, `ci`) and standard technical verbs
(`implement`, `optimize`, `deprecate`, `migrate`, `rename`) stay
allowed — they are the shared vocabulary of the repository, and
dropping them would gut the commit-subject format.

The blocklist targets two kinds of writing instead:

- **Casual filler** that creeps in when the agent is improvising
  ("wip: stuff", "tbh this is fine", "hack fix") and would embarrass
  the user when surfaced on a public PR.
- **Insider shoptalk** that names a reaction, a joke, or a private
  shorthand rather than the change itself — `lgtm`, `nit`, `bikeshed`,
  `kludge`, `footgun`, `boilerplate`. A reader who missed the
  discussion cannot tell what `kludge` refers to, and none of these
  terms says what the commit actually does.

The dividing line: a term stays allowed when it names a concrete
technical action the reader can look up (`refactor`, `migrate`,
`optimize`); it is blocked when it names a social reaction, a joke,
or a private shared context.

## Extending the blocklist

To add a token:

1. Append it to the matching list above.
2. Re-run `npm test`. The smoke test re-reads the blocklist from this
   file and re-scans every commit-message and PR text site.
