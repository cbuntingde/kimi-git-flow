// Smoke test for kimi-git-flow plugin integrity.
//
// Catches regressions in:
//   1. kimi.plugin.json — must parse as JSON, must have the keys the
//      host runtime reads (name, version, skills, commands, hooks).
//   2. Frontmatter — every commands/*.md and skills/git-flow/SKILL.md
//      must carry `name` and `description` so the host can register
//      and trigger them.
//   3. Reference cross-links — every `references/...md` link inside
//      SKILL.md and the commands must point to a file that exists.
//   4. Slug rule — the documented slug transformation must hold for
//      the canonical examples in branch-naming.md. This is the
//      contract every other command depends on.
//   5. State enum — `lastAction` values in SKILL.md, state.md, and
//      status.md must stay in sync with the set guarded here. Drift
//      silently breaks `/status` rendering.
//   6. CI matrix — the dogfooded `.github/workflows/ci.yml` must pin
//      `actions/checkout` and `actions/setup-node` to a full
//      `@vX.Y.Z` tag, declare least-privilege
//      `permissions: contents: read`, and install with a bare
//      `npm ci` (no `|| npm install` fallback that silently
//      re-resolves an absent lockfile).
//   7. `--pr` hint — `commands/watch.md` and `commands/merge.md` must
//      surface the exact `/kimi-git-flow:pr` next-step command when
//      the user invokes them with no PR open. Otherwise the user
//      gets a `gh pr view` failure with no recovery path.
//   8. State cross-link — every command that reads workflow state
//      must cite `references/state.md` so a schema change doesn't
//      break the command silently.
//   9. Orphans — every reference file must have at least one inbound
//      link from SKILL.md or a command. A reference nobody cites is
//      dead documentation.
//  10. Dry-run — `/branch`, `/pr`, and `/merge` must each document a
//      `--dry-run` flag in their Usage section so the audit path is
//      always available.
//  11. Rule 11/12 — `references/safety.md` documents "no silent
//      revert" (forbidding `git checkout --`, `git reset --hard`,
//      `git stash drop`, `git clean -fd` mid-workflow) and "no
//      branching off a divergent default branch". The forbidden
//      verbs must appear literally so the rule can't be silently
//      weakened.
//  12. Preflight gate — SKILL.md step 0 includes a `git log` check
//      comparing local vs origin default branch and refuses to
//      proceed on unpushed commits. Catches drift that would
//      resurrect the silent-revert failure mode.
//  13. Step 6 recovery — SKILL.md step 6 documents all three
//      divergence-recovery paths (`--rebase`, `--no-rebase`,
//      `reset --hard`) with the reset safety gate spelled out and
//      cross-references to rules 11 and 12.
//  14. Soft-rule 4 reset gate — safety.md soft-rule 4 gates
//      `git reset --hard` on every local commit being reachable
//      from `origin/<default-branch>`. Catches drift that would
//      let the agent silently discard the user's commits.
//  15. Language filter — every commit message, PR title, and PR body
//      the workflow writes must pass the slang and jargon blocklist
//      in `references/language.md`. The blocklist is loaded from that
//      file at test time, so adding a token updates every test.
//  16. CI gate fallback — when Actions is unavailable for the
//      repository, step 4 must skip `gh pr checks --watch` and treat
//      the step 2.5 local check as the merge gate. Guards ci-watch.md
//      and SKILL.md against reverting to an "always wait for the
//      remote" assumption.
//  17. Merge strategy — SKILL.md step 5 reads
//      KIMI_GIT_FLOW_MERGE_STRATEGY instead of hardcoding `--squash`.
//  18. Least privilege — the dogfooded workflow and the generated
//      templates declare `permissions: contents: read`.
//  19. Ref hygiene — SKILL.md step 0 quotes every default-branch
//      expansion (defense in depth; git validates refnames).
// Run with `npm test`. Node 20+.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// --- Helpers --------------------------------------------------------------

function read(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function exists(rel) {
  return existsSync(resolve(root, rel));
}

/** Escape every regex metacharacter so file content can never be read as a pattern. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MAX_SLUG = 48;

/**
 * Strict, dependency-free YAML-frontmatter parser for the subset this repo
 * uses: flat `key: value` scalars, optionally double- or single-quoted.
 *
 * This is the only frontmatter parser. Its former lenient sibling sliced each
 * line on the first `:`, so it could not tell valid YAML from a manifest the
 * host rejects and silently skips — exactly how the `git-flow` skill was
 * disabled when an unquoted `description` contained a colon followed by a
 * space (`... workflow: fresh ...`). One parser, one contract.
 *
 * It throws with the offending line number on constructs that make the
 * frontmatter invalid YAML, and on a missing `name`/`description`. Inline
 * comments are deliberately unsupported so a ` #` can never silently become
 * part of a value.
 */
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) throw new Error("missing YAML frontmatter (`---` fenced block)");

  const out = {};
  m[1].split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;

    // A mapping entry: `key:` or `key: value`. The key may itself contain a
    // colon when it is not followed by a space (e.g. `kimi:origin`), so the
    // key group is non-greedy and stops at the first `: ` or trailing `:`.
    const entry = line.match(/^\s*(.*?):(?:[ \t]+(.*))?$/);
    if (!entry) {
      throw new Error(`line ${n}: not a "key: value" mapping entry: ${JSON.stringify(line)}`);
    }

    const key = entry[1].trim();
    const val = entry[2] ?? "";
    const quoted = /^(".*"|'.*')$/.test(val);
    if (!quoted) {
      if (val.endsWith(":")) {
        throw new Error(`line ${n}: unquoted value ends with ":" — wrap the value in quotes: ${JSON.stringify(line)}`);
      }
      if (val.includes(": ")) {
        throw new Error(`line ${n}: unquoted value contains ": " — wrap the value in quotes: ${JSON.stringify(line)}`);
      }
      if (val.includes(" #")) {
        throw new Error(`line ${n}: inline comments are not supported — drop it or quote the value: ${JSON.stringify(line)}`);
      }
    }
    out[key] = quoted ? val.slice(1, -1) : val;
  });

  if (!out.name) throw new Error("frontmatter is missing the required key `name`");
  if (!out.description) throw new Error("frontmatter is missing the required key `description`");
  return out;
}

/**
 * Normalize a branch slug per `references/branch-naming.md` §Slug rules:
 * lowercase → kebab-case → strip `[^a-z0-9]` → cap at MAX_SLUG by dropping
 * WHOLE WORDS from the right (the doc forbids mid-word truncation) → trim a
 * trailing dash. The "first one or two noun phrases" step is semantic, so it
 * lives in the prompt, not here.
 */
function slug(input) {
  const kebab = String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (kebab.length <= MAX_SLUG) return kebab;

  const kept = [];
  let len = 0;
  for (const word of kebab.split("-")) {
    const next = len + word.length + (kept.length ? 1 : 0);
    if (next > MAX_SLUG) break;
    len = next;
    kept.push(word);
  }
  // A single token longer than the cap leaves no whole word that fits; hard
  // cut so the slug is never empty (`fix/` would be an invalid branch).
  return kept.length ? kept.join("-") : kebab.slice(0, MAX_SLUG).replace(/-+$/, "");
}

/** True iff a markdown file cites `references/<target>` as a link or code span. */
function references(md, target) {
  return new RegExp(`references/${escapeRegExp(target)}\\b`).test(md);
}

const REFERENCE_FILES = [
  "skills/git-flow/references/branch-naming.md",
  "skills/git-flow/references/safety.md",
  "skills/git-flow/references/local-check.md",
  "skills/git-flow/references/setup-ci.md",
  "skills/git-flow/references/ci-watch.md",
  "skills/git-flow/references/merge-strategy.md",
  "skills/git-flow/references/pr-template.md",
  "skills/git-flow/references/state.md",
  "skills/git-flow/references/language.md",
];

const COMMAND_FILES = [
  "commands/branch.md",
  "commands/pr.md",
  "commands/watch.md",
  "commands/merge.md",
  "commands/status.md",
  "commands/back-to-main.md",
  "commands/setup-ci.md",
];

const ROOT_FILES = ["skills/git-flow/SKILL.md", ...COMMAND_FILES];

// --- Tests ----------------------------------------------------------------

test("kimi.plugin.json is well-formed and exposes the host-runtime keys", () => {
  const raw = read("kimi.plugin.json");
  const cfg = JSON.parse(raw);
  assert.equal(cfg.name, "kimi-git-flow");
  assert.ok(cfg.version, "version must be set");
  assert.equal(cfg.skills, "./skills/");
  assert.equal(cfg.commands, "./commands/");
  assert.ok(Array.isArray(cfg.hooks), "hooks must be an array");
  assert.ok(
    typeof cfg.skillInstructions === "string" && cfg.skillInstructions.length > 0,
    "skillInstructions must be a non-empty string",
  );
  assert.ok(
    cfg.skillInstructions.length < 1200,
    `skillInstructions is ${cfg.skillInstructions.length} chars; should be under 1200 to avoid host truncation`,
  );
});

test("skillInstructions references the non-negotiable safety rules", () => {
  const cfg = JSON.parse(read("kimi.plugin.json"));
  const s = cfg.skillInstructions;
  assert.ok(typeof s === "string" && s.length > 0, "skillInstructions must be a non-empty string");
  const rules = [
    { name: "no force-push default", re: /force-push/i },
    { name: "no --admin", re: /--admin/i },
    { name: "no merge with red CI", re: /red\s*CI|failing\s*CI|checks?\s*pass/i },
    { name: "no co-mingled changes", re: /co[- ]?mingle|unrelated\s*changes?/i },
    { name: "no silent revert", re: /silent revert|checkout\s*--|reset\s*--hard|stash drop/i },
    { name: "no branching off unpushed default", re: /unpushed\s*commits?/i },
  ];
  for (const r of rules) {
    assert.ok(r.re.test(s), `skillInstructions must mention: ${r.name}`);
  }
});

test("package.json declares the test script, a working lint:links script, and module type", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.type, "module");
  assert.ok(pkg.scripts && pkg.scripts.test, "test script must exist");
  assert.ok(pkg.engines && pkg.engines.node);

  const lintLinks = pkg.scripts["lint:links"];
  assert.ok(lintLinks, "lint:links script must exist");
  // Node ignores `--test-name-pattern` when it trails the positional file
  // path, which silently turned lint:links into a full-suite run. Keep the
  // option before the path so the filter actually applies.
  assert.match(
    lintLinks,
    /--test-name-pattern=\S+\s+\S*smoke\.test\.mjs/,
    `lint:links must place --test-name-pattern before the test file: ${lintLinks}`,
  );
  // The pattern must match at least one test name, so the script can never
  // silently select nothing.
  const pattern = lintLinks.match(/--test-name-pattern=(\S+)/)?.[1];
  const names = Array.from(
    read("test/smoke.test.mjs").matchAll(/^test\("([^"]+)"/gm),
    (m) => m[1],
  );
  assert.ok(
    names.some((name) => new RegExp(pattern).test(name)),
    `lint:links pattern ${JSON.stringify(pattern)} matches no test in smoke.test.mjs`,
  );
});

test("every command markdown has name + description frontmatter", () => {
  for (const rel of COMMAND_FILES) {
    assert.ok(exists(rel), `${rel} must exist`);
    // parseFrontmatter throws when name/description are missing or malformed.
    const { description } = parseFrontmatter(read(rel));
    assert.ok(
      description.length < 200,
      `${rel} description is ${description.length} chars; keep under 200`,
    );
  }
});

test("SKILL.md has name + description frontmatter", () => {
  const { name, description } = parseFrontmatter(read("skills/git-flow/SKILL.md"));
  assert.equal(name, "git-flow");
  assert.ok(
    description.length < 250,
    `SKILL.md description is ${description.length} chars; keep under 250`,
  );
});

test("frontmatter parses as valid YAML (host-rejectable constructs are rejected)", () => {
  // Every manifest the host reads must parse under the strict validator; the
  // lenient parser was removed precisely because it accepted frontmatter the
  // host rejects and silently skips.
  for (const rel of ROOT_FILES) {
    assert.doesNotThrow(
      () => parseFrontmatter(read(rel)),
      `${rel} has invalid YAML frontmatter`,
    );
  }

  // Regression guard: the exact construct that disabled the git-flow skill —
  // an unquoted scalar containing a colon followed by a space.
  assert.throws(
    () => parseFrontmatter("---\nname: git-flow\ndescription: a workflow: b\n---\n"),
    /unquoted value contains ": "/,
    "an unquoted ': ' in a scalar must be rejected",
  );

  // Quoting the same value is the documented fix and must pass.
  assert.doesNotThrow(
    () => parseFrontmatter('---\nname: git-flow\ndescription: "a workflow: b"\n---\n'),
    "a quoted scalar containing ': ' must be accepted",
  );

  // A nested key containing a colon without a following space is valid YAML.
  assert.doesNotThrow(
    () =>
      parseFrontmatter(
        "---\nname: x\ndescription: y\nmetadata:\n  kimi:origin: kimi-git-flow\n---\n",
      ),
    "a `kimi:origin` nested key must be accepted",
  );

  // A missing required key must throw, not silently yield an empty object.
  assert.throws(
    () => parseFrontmatter("---\nname: x\n---\n"),
    /missing the required key `description`/,
    "a frontmatter block without `description` must be rejected",
  );
});

test("every reference cross-link resolves to a file", () => {
  const linkRe = /[`(](references\/[\w-]+\.md)[`)]/g;
  for (const rel of ROOT_FILES) {
    const md = read(rel);
    const fromDir = dirname(resolve(root, rel));
    for (const m of md.matchAll(linkRe)) {
      const target = m[1];
      const abs = resolve(fromDir, target);
      assert.ok(exists(abs), `${rel} references missing file: ${target} (looked at ${abs})`);
    }
  }
});

test("every reference file declared under skills/git-flow/references/ exists", () => {
  for (const rel of REFERENCE_FILES) {
    assert.ok(exists(rel), `${rel} must exist`);
  }
});

test("no reference file is orphaned — every reference must have an inbound link", () => {
  const inbound = new Map(REFERENCE_FILES.map((r) => [r, false]));
  for (const rel of ROOT_FILES) {
    const md = read(rel);
    for (const r of REFERENCE_FILES) {
      if (references(md, r.split("/").pop())) inbound.set(r, true);
    }
  }
  for (const [r, hit] of inbound) {
    assert.ok(hit, `${r} is orphaned — no SKILL.md or command cites it. Add a link or delete the file.`);
  }
});

test("branch slug satisfies the documented invariants (branch-naming.md §Slug rules)", () => {
  for (const input of [
    "rename foo to bar",
    "fix the login redirect bug",
    "add a /healthz endpoint",
    "phase 2: rbac",
    "refactor the error types in src/errors.rs",
    "  Mixed CASE  and!!!punct  ",
  ]) {
    const s = slug(input);
    assert.match(
      s,
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      `slug(${JSON.stringify(input)}) must be lowercase kebab-case: got ${s}`,
    );
    assert.ok(s.length <= MAX_SLUG, `slug must be ≤${MAX_SLUG} chars: ${s}`);
  }

  // Rule 3: cap at 48 by dropping WHOLE WORDS from the right — never truncate
  // mid-word. The previous `.slice(0, 48)` violated the doc it cites.
  const long = Array.from({ length: 40 }, () => "word").join(" ");
  const capped = slug(long);
  assert.ok(capped.length <= MAX_SLUG, `capped slug must be ≤${MAX_SLUG} chars: ${capped}`);
  assert.ok(!capped.endsWith("-"), `capped slug must not end with -: ${capped}`);
  assert.ok(
    long.replace(/\s+/g, "-").startsWith(capped),
    "the cap must be a whole-word prefix of the kebab input, not a slice",
  );
  assert.ok(!capped.endsWith("wor"), "the cap must not truncate mid-word");

  // A single over-long token has no whole word that fits; the slug must still
  // be non-empty and within the cap (an empty slug would render `fix/`).
  const single = slug("x".repeat(80));
  assert.equal(single.length, MAX_SLUG, "a single over-long token must hard-cut to the cap");
  assert.ok(single.length > 0, "the slug must never be empty");

  // The deterministic rules, on inputs with no semantic ambiguity. The doc's
  // noun-phrase examples depend on interpretation, so only the mechanical
  // cases are pinned here.
  assert.equal(slug("phase 2: rbac"), "phase-2-rbac");
  assert.equal(slug("rename foo to bar"), "rename-foo-to-bar");
  assert.equal(slug("foo   bar"), "foo-bar");
  assert.equal(slug("foo!!!bar"), "foo-bar");
  assert.equal(slug("foo___bar"), "foo-bar");
  assert.equal(slug("foo bar "), "foo-bar");
});

test("command markdown has coherent numbered steps (no orphaned prose)", () => {
  for (const rel of COMMAND_FILES) {
    const md = read(rel);
    const section = md.split(/^## What this does$/m)[1]?.split(/^## /m)[0] ?? "";
    const lines = section.split("\n");
    let prevNumber = 0;
    let sawFirst = false;
    for (const line of lines) {
      const m = line.match(/^(\d+)\.\s/);
      if (m) {
        const n = Number(m[1]);
        assert.ok(
          !sawFirst || n === prevNumber + 1,
          `${rel}: numbered steps must be sequential in ## What this does (saw ${prevNumber} then ${n})`,
        );
        sawFirst = true;
        prevNumber = n;
      }
    }
  }
});

test("command markdown has no orphan prose blocks", () => {
  for (const rel of COMMAND_FILES) {
    const md = read(rel);
    const sections = md.split(/^## /m).slice(1);
    for (const s of sections) {
      const lines = s.split("\n");
      const lastNonBlank = lines.findLast((l) => l.trim() !== "");
      assert.ok(
        lastNonBlank && lastNonBlank.length > 0,
        `${rel}: section starting with "## ${s.split("\n")[0].trim()}" has no content`,
      );
    }
  }
});

test("lastAction enum in state.md, SKILL.md, status.md stays in sync", () => {
  const tableCellRe = /^\|[^|]*`?(branched|committed|pr-opened|watched-green|merged|abandoned)`?(?=[^|]*\|)/gm;
  const allowed = new Set([
    "branched",
    "committed",
    "pr-opened",
    "watched-green",
    "merged",
    "abandoned",
  ]);
  const files = [
    "skills/git-flow/SKILL.md",
    "skills/git-flow/references/state.md",
    "commands/status.md",
  ];
  for (const rel of files) {
    const md = read(rel);
    const seen = new Set();
    for (const m of md.matchAll(tableCellRe)) {
      seen.add(m[1]);
    }
    for (const v of seen) {
      assert.ok(allowed.has(v), `${rel} lists unknown lastAction value: ${v}`);
    }
  }
});

test("state.md does not reintroduce 'pushed' as a separate lastAction value", () => {
  const md = read("skills/git-flow/references/state.md");
  const tableRow = md.split("\n").find((line) => /^\|\s*`?pushed`?\s*\|/.test(line));
  assert.ok(!tableRow, "state.md must not list 'pushed' as a lastAction value in any table row");
});

test("dogfooded CI workflow is least-privilege and installs strictly from the lockfile", () => {
  const yml = read(".github/workflows/ci.yml");
  assert.match(
    yml,
    /^permissions:\r?\n[ \t]+contents:[ \t]*read[ \t]*\r?$/m,
    "CI must declare least-privilege `permissions: contents: read`",
  );
  assert.match(
    yml,
    /uses:\s*actions\/checkout@v\d+\.\d+\.\d+/,
    "actions/checkout must be pinned to a full @vX.Y.Z tag",
  );
  assert.match(
    yml,
    /uses:\s*actions\/setup-node@v\d+\.\d+\.\d+/,
    "actions/setup-node must be pinned to a full @vX.Y.Z tag",
  );
  assert.match(
    yml,
    /^\s*-\s*run:\s*npm ci\s*$/m,
    "CI must install strictly from the lockfile with a bare `npm ci`",
  );
  assert.doesNotMatch(
    yml,
    /^\s*-\s*run:.*\|\|/m,
    "no CI step may fall back to `npm install` when `npm ci` fails",
  );
});

test("the generated CI templates are least-privilege too", () => {
  const tmpl = read("skills/git-flow/references/setup-ci.md");
  const templates = tmpl.match(/```yaml[\s\S]*?```/g) ?? [];
  assert.ok(templates.length >= 4, "setup-ci.md must document the Node/Python/Rust/Go templates");
  for (const block of templates) {
    assert.match(
      block,
      /^permissions:\r?\n[ \t]+contents:[ \t]*read[ \t]*\r?$/m,
      "every generated workflow template must declare `permissions: contents: read`",
    );
  }
});

test("SKILL.md quotes every default-branch expansion in step 0", () => {
  const preflight = read("skills/git-flow/SKILL.md").split("### 1. Create the branch")[0];
  assert.ok(
    /"origin\/\$\{DEFAULT_BRANCH\}\.\.\$\{DEFAULT_BRANCH\}"/.test(preflight),
    "the divergence check must quote the ref expansion",
  );
});

test("SKILL.md step 5 honors KIMI_GIT_FLOW_MERGE_STRATEGY instead of hardcoding --squash", () => {
  const step5 = read("skills/git-flow/SKILL.md").split("### 5. Merge")[1].split("### 6.")[0];
  assert.ok(
    /KIMI_GIT_FLOW_MERGE_STRATEGY/.test(step5),
    "step 5 must read KIMI_GIT_FLOW_MERGE_STRATEGY",
  );
  assert.ok(
    /--rebase/.test(step5) && /--merge/.test(step5),
    "step 5 must map the rebase and merge strategies",
  );
  assert.ok(/"\$STRATEGY"/.test(step5), "step 5 must pass the strategy as a quoted variable");
});

test("watch.md and merge.md surface /kimi-git-flow:pr when no PR is open", () => {
  const watch = read("commands/watch.md");
  const merge = read("commands/merge.md");
  assert.ok(
    /\/kimi-git-flow:pr/.test(watch),
    "commands/watch.md must mention /kimi-git-flow:pr as the recovery path when no PR is open",
  );
  assert.ok(
    /\/kimi-git-flow:pr/.test(merge),
    "commands/merge.md must mention /kimi-git-flow:pr as the recovery path when no PR is open",
  );
});

test("branch, pr, and merge commands document a --dry-run flag", () => {
  for (const rel of ["commands/branch.md", "commands/pr.md", "commands/merge.md"]) {
    const md = read(rel);
    assert.ok(
      /--dry-run/.test(md),
      `${rel} must document the --dry-run flag in its Usage section`,
    );
  }
});

test("state.md is cross-linked from every command that reads workflow state", () => {
  const consumers = [
    "commands/status.md",
    "commands/merge.md",
  ];
  for (const rel of consumers) {
    const md = read(rel);
    assert.ok(
      references(md, "state.md"),
      `${rel} reads workflow state but does not cross-link references/state.md`,
    );
  }
});

test("safety.md documents rule 11 (no silent revert) and rule 12 (no unpushed local commits on default branch)", () => {
  const md = read("skills/git-flow/references/safety.md");
  assert.ok(
    /11\.\s*\*\*No silent revert\.\*\*/.test(md),
    "safety.md must document rule 11: No silent revert (forbids `git checkout --`, `git reset --hard`, `git stash drop`, `git clean -fd` without explicit user approval)",
  );
  assert.ok(
    /12\.\s*\*\*No branching off a default branch that has unpushed commits/.test(md),
    "safety.md must document rule 12: No branching off a default branch with unpushed commits",
  );
  // Both rules must mention the exact verbs they forbid so the procedure
  // can grep-guard against reintroduction.
  for (const verb of [
    "`git checkout -- <path>`",
    "`git reset --hard`",
    "`git stash drop`",
    "`git clean -fd`",
  ]) {
    assert.ok(
      md.includes(verb),
      `safety.md rule 11 must explicitly name the forbidden command: ${verb}`,
    );
  }
  assert.ok(
    /origin\/\${\s*DEFAULT_BRANCH\s*}|origin\/<default-branch>|origin\/<default>/.test(md),
    "safety.md must reference the local-vs-origin divergence check for the default branch",
  );
});

test("SKILL.md preflight refuses to proceed when local default branch has unpushed commits", () => {
  const md = read("skills/git-flow/SKILL.md");
  const preflight = md.split("### 1. Create the branch")[0];
  assert.ok(
    /origin\/\$\{DEFAULT_BRANCH\}\.\.\$\{DEFAULT_BRANCH\}/.test(preflight),
    "SKILL.md preflight must include a git log check that uses ${DEFAULT_BRANCH} to compare local and origin default branches (no plain-text fallback)",
  );
  assert.ok(
    /unpushed/.test(preflight) || /ahead of/.test(preflight),
    "SKILL.md preflight must call out unpushed/ahead commits as a stop condition",
  );
  assert.ok(
    /rule 12/.test(preflight),
    "SKILL.md preflight must cross-reference safety.md rule 12",
  );
});

test("SKILL.md step 6 documents all three divergence-recovery options (rebase / merge / reset) with the reset safety gate", () => {
  const md = read("skills/git-flow/SKILL.md");
  const step6 = md.split("### 7. Loop")[0];
  for (const opt of ["--rebase", "--no-rebase", "reset --hard"]) {
    assert.ok(
      step6.includes(opt),
      `SKILL.md step 6 must mention the '${opt}' divergence-recovery path`,
    );
  }
  // The reset path must cross-reference rules 11 and 12 so the
  // safety contract is enforced.
  assert.ok(
    /rule 11/.test(step6) && /rule 12/.test(step6),
    "SKILL.md step 6's reset option must cross-reference safety.md rules 11 and 12",
  );
  // The reset safety gate (verify local-only commits are empty
  // before discarding) must be spelled out.
  assert.ok(
    /origin\/<default-branch>\.\.HEAD/.test(step6) && /HEAD\.\.origin\/<default-branch>/.test(step6),
    "SKILL.md step 6 must show the two git-log checks that gate the reset path",
  );
});

test("soft-rule 4 in safety.md gates `git reset --hard` on every local commit being reachable from origin", () => {
  const md = read("skills/git-flow/references/safety.md");
  const softRules = md.split("## Abort message format")[0];
  assert.ok(
    /`git pull --ff-only` fails after merge/.test(softRules),
    "soft-rule 4 must still cover the `git pull --ff-only` failure case",
  );
  assert.ok(
    /sanctioned.*only when.*every.*local.*commit.*reachable.*origin/i.test(softRules) ||
      /safe to `git reset --hard origin/.test(softRules),
    "soft-rule 4 must gate `git reset --hard` on the local-vs-origin commit check",
  );
});

test("language filter: commit messages, PR titles, and PR bodies stay free of blocked slang and jargon", () => {
  // Load the blocklist straight out of the rule doc so adding a token
  // to language.md automatically tightens every other site. Only
  // `- `token`` list items count — prose backticks in the same section
  // describe the whole-word rule (`[A-Za-z0-9_]`, `stuffy`, ...) and
  // must not be mistaken for tokens.
  const ruleDoc = read("skills/git-flow/references/language.md");
  const blocklistSection = ruleDoc
    .split("## Blocklist")[1]
    .split("## How the workflow applies the rule")[0];
  const tokens = Array.from(
    blocklistSection.matchAll(/^- `([a-z][a-z-]*)`$/gm),
    (m) => m[1],
  );
  assert.ok(tokens.length > 0, "language.md must define at least one blocked token");
  assert.ok(
    /### Casual filler/.test(blocklistSection) &&
      /### Development slang and jargon/.test(blocklistSection),
    "language.md blocklist must keep both the casual-filler and jargon lists",
  );

  // The workflow writes strings from five sites. We extract the literal
  // substrings that actually land in commits, PR titles, or PR bodies:
  //   - commit subjects inside `git commit -m "..."` and quoted in prose
  //   - PR titles inside `--title "..."` and the template's title rule
  //   - PR body bullets inside the markdown fences in pr-template.md
  const sites = [
    {
      path: "skills/git-flow/SKILL.md",
      label: "SKILL.md commit + PR sections",
      samples: extractQuotedStrings(read("skills/git-flow/SKILL.md")),
    },
    {
      path: "skills/git-flow/references/branch-naming.md",
      label: "branch-naming.md conventional-commit section",
      samples: extractQuotedStrings(
        read("skills/git-flow/references/branch-naming.md"),
      ).concat(
        extractBacktickSamples(
          read("skills/git-flow/references/branch-naming.md"),
        ),
      ),
    },
    {
      path: "skills/git-flow/references/pr-template.md",
      label: "pr-template.md body markdown",
      samples: extractMarkdownBodyBullets(
        read("skills/git-flow/references/pr-template.md"),
      ).concat(
        extractBacktickSamples(read("skills/git-flow/references/pr-template.md")),
      ),
    },
    {
      path: "skills/git-flow/references/setup-ci.md",
      label: "setup-ci.md scaffold commit + PR title",
      samples: extractQuotedStrings(read("skills/git-flow/references/setup-ci.md")),
    },
    {
      path: "commands/setup-ci.md",
      label: "commands/setup-ci.md commit subject",
      samples: extractQuotedStrings(read("commands/setup-ci.md")),
    },
  ];

  for (const site of sites) {
    for (const token of tokens) {
      const re = new RegExp(`(?<![A-Za-z0-9_])${token}(?![A-Za-z0-9_])`, "i");
      for (const sample of site.samples) {
        assert.ok(
          !re.test(sample),
          `${site.label} contains blocked token "${token}" in: ${JSON.stringify(sample)}`,
        );
      }
    }
  }
});

test("step 4 uses the local check as the merge gate when Actions is unavailable", () => {
  const NOTICE =
    "no remote CI: Actions is unavailable for this repository; local check result was";

  for (const rel of [
    "skills/git-flow/references/ci-watch.md",
    "skills/git-flow/SKILL.md",
  ]) {
    const md = read(rel);
    assert.ok(
      md.includes("actions/permissions"),
      `${rel} must detect Actions availability via repos/{owner}/{repo}/actions/permissions`,
    );
    assert.ok(
      md.includes(NOTICE),
      `${rel} must print the Actions-unavailable notice carrying the local check result`,
    );
    assert.ok(
      /step 2\.5/.test(md),
      `${rel} must name the step 2.5 local check as the merge gate`,
    );
  }

  const ciWatch = read("skills/git-flow/references/ci-watch.md");
  assert.ok(
    /Do \*\*not\*\* run `gh pr checks --watch`/.test(ciWatch),
    "ci-watch.md must forbid the watch when Actions is unavailable",
  );
});

// Pull every `"..."` string out of a markdown file. These are the
// strings the agent will pass to `git commit -m` or `--title`.
function extractQuotedStrings(md) {
  return Array.from(md.matchAll(/"([^"\n]+)"/g), (m) => m[1]);
}

// Pull every `` `...` `` string. Catches the conventional-commit
// subject samples in branch-naming.md and the squash title example
// in pr-template.md.
function extractBacktickSamples(md) {
  return Array.from(md.matchAll(/`([^`\n]+)`/g), (m) => m[1]);
}

// Pull every "- ..." bullet inside ```markdown fences. These are the
// exact lines the workflow hands to `gh pr create --body-file`.
function extractMarkdownBodyBullets(md) {
  const out = [];
  const fenceRe = /```markdown\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(md))) {
    for (const line of m[1].split("\n")) {
      const bullet = line.match(/^- (.+)$/);
      if (bullet) out.push(bullet[1]);
      else if (line.trim().length > 0 && !line.trimStart().startsWith("#")) {
        out.push(line.trim());
      }
    }
  }
  return out;
}
