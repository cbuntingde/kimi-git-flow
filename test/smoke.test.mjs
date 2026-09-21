// Smoke test for kimi-git-flow plugin integrity.
//
// The plugin is prose plus a small manifest, so its regression surface is
// structural: manifests that must parse, frontmatter the host can register,
// cross-links that must resolve, and the safety / enum contracts the
// procedure and the slash commands share.
//
// Every file list is derived from disk (see `markdownIn`). A hand-maintained
// manifest drifts: a newly added command or reference would silently escape
// the frontmatter, cross-link, orphan, and dry-run checks.
//
// Run with `npm test`. Node 20+.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));

const markdownIn = (dir) =>
  readdirSync(resolve(root, dir))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => `${dir}/${f}`);

const COMMAND_FILES = markdownIn("commands");
const REFERENCE_FILES = markdownIn("skills/git-flow/references");
const SKILL_FILE = "skills/git-flow/SKILL.md";
const STATE_FILE = "skills/git-flow/references/state.md";
const ROOT_FILES = [SKILL_FILE, ...COMMAND_FILES];

const MAX_SLUG = 48;

// The single source of truth for the persisted action enum. Every doc that
// renders it must agree with this set — drift silently breaks `/status`.
const ALLOWED_ACTIONS = [
  "abandoned",
  "branched",
  "committed",
  "merged",
  "pr-opened",
  "watched-green",
];

// --- Helpers --------------------------------------------------------------

/** Escape every regex metacharacter so file content is matched literally. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Body of the first `## <heading>` section, heading line excluded. */
function section(md, heading) {
  const body = md.split(/^## /m).find((part) => part.startsWith(heading));
  if (body === undefined) throw new Error(`missing section: ## ${heading}`);
  return body.split(/\r?\n/).slice(1).join("\n");
}

/** Backticked lowercase-kebab tokens from the first cell of each table row. */
function firstCellTokens(text) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("|")) continue;
    const m = (line.split("|")[1] ?? "").match(/`([^`]+)`/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Backticked lowercase-kebab tokens from every cell of each table row. */
function tableTokens(text) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("|")) continue;
    for (const m of line.matchAll(/`([a-z][a-z-]*)`/g)) out.add(m[1]);
  }
  return out;
}

/**
 * Strict, dependency-free YAML-frontmatter parser for the subset this repo
 * uses: flat `key: value` scalars, optionally double- or single-quoted.
 *
 * The host rejects frontmatter whose unquoted scalar contains `: `, a
 * trailing `:`, or an inline comment — and silently skips the command or
 * skill when it does. This parser throws on those constructs so the failure
 * surfaces here instead of as a missing slash command.
 */
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) throw new Error("missing YAML frontmatter (`---` fenced block)");

  const out = {};
  m[1].split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;

    // A key may itself contain a colon when not followed by a space
    // (e.g. `kimi:origin`), so the key group is non-greedy.
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
 * whole words from the right (never truncate mid-word) → trim trailing dash.
 * The "first one or two noun phrases" step is semantic and lives in the
 * prompt, not here.
 */
function slug(input) {
  const kebab = String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // An input with no alphanumerics normalizes to nothing. Returning "" would
  // render an invalid branch like `fix/`, so refuse instead.
  if (kebab === "") {
    throw new Error(
      `cannot derive a slug from ${JSON.stringify(input)}: it contains no [a-z0-9] characters`,
    );
  }
  if (kebab.length <= MAX_SLUG) return kebab;

  const kept = [];
  let len = 0;
  for (const word of kebab.split("-")) {
    const next = len + word.length + (kept.length ? 1 : 0);
    if (next > MAX_SLUG) break;
    len = next;
    kept.push(word);
  }
  // A single over-long token leaves no whole word that fits; hard-cut so the
  // slug is never empty.
  return kept.length ? kept.join("-") : kebab.slice(0, MAX_SLUG).replace(/-+$/, "");
}

/** True iff a markdown file cites `references/<target>` as a link or code span. */
function references(md, target) {
  return new RegExp(`references/${escapeRegExp(target)}\\b`).test(md);
}

// --- Tests ----------------------------------------------------------------

test("kimi.plugin.json is well-formed and exposes the host-runtime keys", () => {
  const cfg = JSON.parse(read("kimi.plugin.json"));
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
    `skillInstructions is ${cfg.skillInstructions.length} chars; keep it under 1200 to avoid host truncation`,
  );
});

test("skillInstructions references the non-negotiable safety rules", () => {
  const { skillInstructions: s } = JSON.parse(read("kimi.plugin.json"));
  assert.ok(typeof s === "string" && s.length > 0, "skillInstructions must be a non-empty string");
  const rules = [
    { name: "no force-push default", re: /force-push/i },
    { name: "no --admin", re: /--admin/i },
    { name: "no merge with red CI", re: /red\s*CI|failing\s*CI|checks?\s*pass/i },
    { name: "no co-mingled changes", re: /co[- ]?mingle|unrelated\s*changes?/i },
    { name: "no silent revert", re: /silent revert|checkout\s*--|reset\s*--hard|stash drop/i },
    { name: "no branching off unpushed default", re: /unpushed\s*commits?/i },
    { name: "no-Actions merge gate", re: /Actions is unavailable/i },
    {
      name: "one branch at a time, nothing left behind",
      re: /second\s*branch|unmerged|left\s*behind/i,
    },
  ];
  for (const r of rules) {
    assert.ok(r.re.test(s), `skillInstructions must mention: ${r.name}`);
  }
});

test("package.json declares the test script, a working lint:links script, and module type", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.type, "module");
  assert.ok(pkg.scripts && pkg.scripts.test, "test script must exist");
  assert.ok(pkg.engines && pkg.engines.node, "engines.node must be set");

  const lintLinks = pkg.scripts["lint:links"];
  assert.ok(lintLinks, "lint:links script must exist");
  // Node ignores `--test-name-pattern` when it trails the positional file
  // path, which would silently turn lint:links into a full-suite run.
  assert.match(
    lintLinks,
    /--test-name-pattern=\S+\s+\S*smoke\.test\.mjs/,
    `lint:links must place --test-name-pattern before the test file: ${lintLinks}`,
  );
  // The pattern must select at least one test, or the script silently runs
  // nothing and exits 0.
  const pattern = lintLinks.match(/--test-name-pattern=(\S+)/)?.[1];
  const names = Array.from(read("test/smoke.test.mjs").matchAll(/^test\("([^"]+)"/gm), (m) => m[1]);
  assert.ok(
    names.some((name) => new RegExp(pattern).test(name)),
    `lint:links pattern ${JSON.stringify(pattern)} matches no test in smoke.test.mjs`,
  );
});

test("the derived file manifests are non-empty", () => {
  assert.ok(COMMAND_FILES.length > 0, "commands/ must contain at least one .md file");
  assert.ok(REFERENCE_FILES.length > 0, "skills/git-flow/references/ must contain at least one .md file");
});

test("every command markdown has name + description frontmatter", () => {
  for (const rel of COMMAND_FILES) {
    assert.ok(exists(rel), `${rel} must exist`);
    const { description } = parseFrontmatter(read(rel)); // throws when malformed
    assert.ok(description.length < 200, `${rel} description is ${description.length} chars; keep under 200`);
  }
});

test("SKILL.md has name + description frontmatter", () => {
  const { name, description } = parseFrontmatter(read(SKILL_FILE));
  assert.equal(name, "git-flow");
  assert.ok(description.length < 250, `SKILL.md description is ${description.length} chars; keep under 250`);
});

test("frontmatter parses as valid YAML (host-rejectable constructs are rejected)", () => {
  for (const rel of ROOT_FILES) {
    assert.doesNotThrow(() => parseFrontmatter(read(rel)), `${rel} has invalid YAML frontmatter`);
  }

  // Regression guard: the construct that silently disabled the git-flow
  // skill — an unquoted scalar containing a colon followed by a space.
  assert.throws(
    () => parseFrontmatter("---\nname: git-flow\ndescription: a workflow: b\n---\n"),
    /unquoted value contains ": "/,
    "an unquoted ': ' in a scalar must be rejected",
  );
  assert.doesNotThrow(
    () => parseFrontmatter('---\nname: git-flow\ndescription: "a workflow: b"\n---\n'),
    "a quoted scalar containing ': ' must be accepted",
  );
  assert.doesNotThrow(
    () => parseFrontmatter("---\nname: x\ndescription: y\nmetadata:\n  kimi:origin: kimi-git-flow\n---\n"),
    "a `kimi:origin` nested key must be accepted",
  );
  assert.throws(
    () => parseFrontmatter("---\nname: x\n---\n"),
    /missing the required key `description`/,
    "a frontmatter block without `description` must be rejected",
  );
});

test("every reference cross-link resolves to a file", () => {
  const linkRe = /[`(](references\/[\w-]+\.md)[`)]/g;
  for (const rel of ROOT_FILES) {
    const fromDir = dirname(resolve(root, rel));
    for (const m of read(rel).matchAll(linkRe)) {
      const target = m[1];
      assert.ok(exists(resolve(fromDir, target)), `${rel} references missing file: ${target}`);
    }
  }
});

test("every reference file under skills/git-flow/references/ exists", () => {
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
    assert.match(s, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `slug must be lowercase kebab-case: ${JSON.stringify(input)} → ${s}`);
    assert.ok(s.length <= MAX_SLUG, `slug must be ≤${MAX_SLUG} chars: ${s}`);
  }

  // Rule 3: cap at 48 by dropping WHOLE WORDS from the right, never
  // mid-word. A `.slice(0, 48)` would violate the doc it cites.
  const long = Array.from({ length: 40 }, () => "word").join(" ");
  const capped = slug(long);
  assert.ok(capped.length <= MAX_SLUG, `capped slug must be ≤${MAX_SLUG} chars: ${capped}`);
  assert.ok(!capped.endsWith("-"), `capped slug must not end with -: ${capped}`);
  assert.ok(long.replace(/\s+/g, "-").startsWith(capped), "the cap must be a whole-word prefix, not a slice");
  assert.ok(!capped.endsWith("wor"), "the cap must not truncate mid-word");

  // A single over-long token has no whole word that fits; hard-cut to the cap.
  assert.equal(slug("x".repeat(80)).length, MAX_SLUG, "a single over-long token must hard-cut to the cap");

  // An input with no alphanumerics has no valid slug; refuse rather than
  // emit an empty slug (`fix/`).
  assert.throws(() => slug("!!!"), /no \[a-z0-9\]/, "a punctuation-only input must not yield an empty slug");
  assert.throws(() => slug("   "), /no \[a-z0-9\]/, "a whitespace-only input must not yield an empty slug");

  for (const [input, expected] of [
    ["phase 2: rbac", "phase-2-rbac"],
    ["rename foo to bar", "rename-foo-to-bar"],
    ["foo   bar", "foo-bar"],
    ["foo!!!bar", "foo-bar"],
    ["foo___bar", "foo-bar"],
    ["foo bar ", "foo-bar"],
  ]) {
    assert.equal(slug(input), expected, `slug(${JSON.stringify(input)})`);
  }
});

test("command markdown has coherent numbered steps (no orphaned prose)", () => {
  for (const rel of COMMAND_FILES) {
    const body = read(rel).split(/^## What this does$/m)[1]?.split(/^## /m)[0] ?? "";
    let prevNumber = 0;
    let sawFirst = false;
    for (const line of body.split("\n")) {
      const m = line.match(/^(\d+)\.\s/);
      if (!m) continue;
      const n = Number(m[1]);
      assert.ok(
        !sawFirst || n === prevNumber + 1,
        `${rel}: numbered steps must be sequential in ## What this does (saw ${prevNumber} then ${n})`,
      );
      sawFirst = true;
      prevNumber = n;
    }
  }
});

test("command markdown has no orphan prose blocks", () => {
  for (const rel of COMMAND_FILES) {
    for (const s of read(rel).split(/^## /m).slice(1)) {
      const lastNonBlank = s.split("\n").findLast((l) => l.trim() !== "");
      assert.ok(lastNonBlank, `${rel}: section "## ${s.split("\n")[0].trim()}" has no content`);
    }
  }
});

test("the lastAction enum is defined once in state.md and every consuming doc agrees", () => {
  // state.md owns the definition: the first column of its `lastAction` table.
  const defined = [...firstCellTokens(section(read(STATE_FILE), "`lastAction` values"))].sort();
  assert.deepEqual(defined, ALLOWED_ACTIONS, "state.md must define exactly the allowed action enum");

  // SKILL.md renders the same enum as a (step → action) table. The action
  // sits in the second cell, so match any cell in the row.
  const rendered = [...tableTokens(section(read(SKILL_FILE), "State persistence"))].sort();
  assert.deepEqual(rendered, ALLOWED_ACTIONS, "SKILL.md's State persistence table must list exactly the enum");

  // status.md lists the values in prose (no table), so require each one.
  const status = read("commands/status.md");
  for (const action of ALLOWED_ACTIONS) {
    assert.ok(status.includes(`\`${action}\``), `commands/status.md must list the \`${action}\` action`);
  }
});

test("state.md does not reintroduce 'pushed' as a separate lastAction value", () => {
  const row = read(STATE_FILE).split("\n").find((line) => /^\|\s*`?pushed`?\s*\|/.test(line));
  assert.ok(!row, "state.md must not list 'pushed' as a lastAction value in any table row");
});

test("dogfooded CI workflow is least-privilege and installs strictly from the lockfile", () => {
  const yml = read(".github/workflows/ci.yml");
  assert.match(
    yml,
    /^permissions:\r?\n[ \t]+contents:[ \t]*read[ \t]*\r?$/m,
    "CI must declare least-privilege `permissions: contents: read`",
  );
  assert.match(yml, /uses:\s*actions\/checkout@v\d+\.\d+\.\d+/, "actions/checkout must be pinned to a full @vX.Y.Z tag");
  assert.match(yml, /uses:\s*actions\/setup-node@v\d+\.\d+\.\d+/, "actions/setup-node must be pinned to a full @vX.Y.Z tag");
  assert.match(yml, /^\s*-\s*run:\s*npm ci\s*$/m, "CI must install strictly from the lockfile with a bare `npm ci`");
  assert.doesNotMatch(yml, /^\s*-\s*run:.*\|\|/m, "no CI step may fall back to `npm install` when `npm ci` fails");
});

test("the generated CI templates are least-privilege too", () => {
  const templates = read("skills/git-flow/references/setup-ci.md").match(/```yaml[\s\S]*?```/g) ?? [];
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
  const preflight = read(SKILL_FILE).split("### 1. Create the branch")[0];
  assert.ok(
    /"origin\/\$\{DEFAULT_BRANCH\}\.\.\$\{DEFAULT_BRANCH\}"/.test(preflight),
    "the divergence check must quote the ref expansion",
  );
});

test("SKILL.md step 5 honors KIMI_GIT_FLOW_MERGE_STRATEGY instead of hardcoding --squash", () => {
  const step5 = read(SKILL_FILE).split("### 5. Merge")[1].split("### 6.")[0];
  assert.ok(/KIMI_GIT_FLOW_MERGE_STRATEGY/.test(step5), "step 5 must read KIMI_GIT_FLOW_MERGE_STRATEGY");
  assert.ok(/--rebase/.test(step5) && /--merge/.test(step5), "step 5 must map the rebase and merge strategies");
  assert.ok(/"\$STRATEGY"/.test(step5), "step 5 must pass the strategy as a quoted variable");
});

test("watch.md and merge.md surface /kimi-git-flow:pr when no PR is open", () => {
  for (const rel of ["commands/watch.md", "commands/merge.md"]) {
    assert.ok(
      /\/kimi-git-flow:pr/.test(read(rel)),
      `${rel} must mention /kimi-git-flow:pr as the recovery path when no PR is open`,
    );
  }
});

test("branch, pr, and merge commands document a --dry-run flag", () => {
  for (const rel of ["commands/branch.md", "commands/pr.md", "commands/merge.md"]) {
    assert.ok(/--dry-run/.test(read(rel)), `${rel} must document the --dry-run flag in its Usage section`);
  }
});

test("state.md is cross-linked from every command that reads workflow state", () => {
  for (const rel of ["commands/status.md", "commands/merge.md"]) {
    assert.ok(references(read(rel), "state.md"), `${rel} reads workflow state but does not cross-link references/state.md`);
  }
});

test("safety.md documents rule 11 (no silent revert) and rule 12 (no unpushed local commits on default branch)", () => {
  const md = read("skills/git-flow/references/safety.md");
  assert.ok(/11\.\s*\*\*No silent revert\.\*\*/.test(md), "safety.md must document rule 11: No silent revert");
  assert.ok(
    /12\.\s*\*\*No branching off a default branch that has unpushed commits/.test(md),
    "safety.md must document rule 12: No branching off a default branch with unpushed commits",
  );
  for (const verb of ["`git checkout -- <path>`", "`git reset --hard`", "`git stash drop`", "`git clean -fd`"]) {
    assert.ok(md.includes(verb), `safety.md rule 11 must explicitly name the forbidden command: ${verb}`);
  }
  assert.ok(
    /origin\/\${\s*DEFAULT_BRANCH\s*}|origin\/<default-branch>|origin\/<default>/.test(md),
    "safety.md must reference the local-vs-origin divergence check for the default branch",
  );
});

test("SKILL.md preflight refuses to proceed when local default branch has unpushed commits", () => {
  const preflight = read(SKILL_FILE).split("### 1. Create the branch")[0];
  assert.ok(
    /origin\/\$\{DEFAULT_BRANCH\}\.\.\$\{DEFAULT_BRANCH\}/.test(preflight),
    "SKILL.md preflight must compare local and origin default branches via ${DEFAULT_BRANCH}",
  );
  assert.ok(/unpushed/.test(preflight) || /ahead of/.test(preflight), "SKILL.md preflight must call out unpushed/ahead commits as a stop condition");
  assert.ok(/rule 12/.test(preflight), "SKILL.md preflight must cross-reference safety.md rule 12");
  // The divergence check is meaningless without a local remote-tracking ref:
  // `git log` exits 128 and the guard reads an empty string.
  assert.ok(
    /rev-parse --verify --quiet "refs\/remotes\/origin\/\$DEFAULT_BRANCH"/.test(preflight),
    "SKILL.md preflight must verify origin/<default-branch> exists before the divergence check",
  );
});

test("SKILL.md step 6 documents all three divergence-recovery options (rebase / merge / reset) with the reset safety gate", () => {
  const step6 = read(SKILL_FILE).split("### 8. Loop")[0];
  for (const opt of ["--rebase", "--no-rebase", "reset --hard"]) {
    assert.ok(step6.includes(opt), `SKILL.md step 6 must mention the '${opt}' divergence-recovery path`);
  }
  assert.ok(/rule 11/.test(step6) && /rule 12/.test(step6), "SKILL.md step 6's reset option must cross-reference safety.md rules 11 and 12");
  assert.ok(
    /origin\/<default-branch>\.\.HEAD/.test(step6) && /HEAD\.\.origin\/<default-branch>/.test(step6),
    "SKILL.md step 6 must show the two git-log checks that gate the reset path",
  );
});

test("SKILL.md preflight refuses to start while another branch or pull request is open (step 0g)", () => {
  const preflight = read(SKILL_FILE).split("### 1. Create the branch")[0];
  assert.ok(
    /git for-each-ref --format='%\(refname:short\)' refs\/heads\//.test(preflight),
    "step 0g must enumerate local branches via git for-each-ref",
  );
  assert.ok(/grep -vx "\$DEFAULT_BRANCH"/.test(preflight), "step 0g must exclude the default branch from the leftover list");
  assert.ok(
    /gh pr list --state open --json number,headRefName/.test(preflight),
    "step 0g must refuse while any pull request is open",
  );
  assert.ok(
    /aborted: a branch is already open/.test(preflight) && /aborted: a pull request is already open/.test(preflight),
    "step 0g must print both abort messages",
  );
  assert.ok(
    references(preflight, "no-leftovers.md"),
    "step 0g must cross-link references/no-leftovers.md",
  );
});

test("SKILL.md step 7 closes the loop with the four leftover checks", () => {
  const step7 = read(SKILL_FILE).split("### 7. Nothing left behind")[1]?.split("### 8. Loop")[0] ?? "";
  assert.ok(step7.length > 0, "SKILL.md must have a step 7 named 'Nothing left behind'");
  for (const cmd of ["git status --porcelain", "git branch", "git stash list"]) {
    assert.ok(step7.includes(cmd), `step 7 must run \`${cmd}\``);
  }
  assert.ok(
    /git log --oneline origin\/main\.\.main/.test(step7),
    "step 7 must check that the default branch is not ahead of origin",
  );
  assert.ok(/references\/no-leftovers\.md/.test(step7), "step 7 must cross-link references/no-leftovers.md");
});

test("the branch delete is never silenced, so an unmerged branch cannot be hidden", () => {
  // `git branch -d` refuses to delete an unmerged branch. That refusal is the
  // only signal step 5 did not land; `|| true` discards it and reports success.
  const silenced = /git branch -d\s+\S+[^`\n]*\|\|\s*true/;
  for (const rel of [SKILL_FILE, "commands/merge.md"]) {
    assert.ok(!silenced.test(read(rel)), `${rel} must not silence \`git branch -d\` with \`|| true\``);
  }
  assert.ok(
    /git branch -d <branch>\s*$/m.test(read(SKILL_FILE)),
    "SKILL.md step 6 must run an unsilenced `git branch -d <branch>`",
  );
  // no-leftovers.md is the one file allowed to contain the silenced form,
  // because it documents the regression. Require the quote, so deleting the
  // explanation fails here rather than passing quietly.
  assert.ok(
    silenced.test(read("skills/git-flow/references/no-leftovers.md")),
    "no-leftovers.md must keep quoting the old silenced form as the failure it replaced",
  );
});

test("a failed step 2.5 pushes the branch before aborting, so nothing is local-only", () => {
  const step25 = read(SKILL_FILE).split("### 2.5 Local check")[1]?.split("### 3.")[0] ?? "";
  assert.ok(step25.length > 0, "SKILL.md must still have a step 2.5");
  assert.ok(
    /push the branch before stopping/i.test(step25),
    "step 2.5 must require the branch to be pushed on any post-commit abort",
  );
  assert.ok(
    /git push -u origin <branch>/.test(step25),
    "step 2.5 must name the exact push command",
  );
  assert.ok(references(step25, "no-leftovers.md"), "step 2.5 must cross-link references/no-leftovers.md");
});

test("safety.md documents rule 13 (no leftovers) and no-leftovers.md carries both checks", () => {
  const safety = read("skills/git-flow/references/safety.md");
  assert.ok(/13\.\s*\*\*No leftovers\.\*\*/.test(safety), "safety.md must document rule 13: No leftovers");
  assert.ok(
    /step 0g/.test(safety) && /step 7/.test(safety),
    "rule 13 must name both the preflight (0g) and the end-of-run check (7)",
  );
  assert.ok(references(safety, "no-leftovers.md"), "rule 13 must cross-link references/no-leftovers.md");

  const doc = read("skills/git-flow/references/no-leftovers.md");
  assert.ok(
    /git for-each-ref --format='%\(refname:short\)' refs\/heads\//.test(doc),
    "no-leftovers.md must document the local-branch check",
  );
  assert.ok(/gh pr list --state open/.test(doc), "no-leftovers.md must document the open-pull-request check");
  for (const cmd of ["git status --porcelain", "git branch", "git stash list"]) {
    assert.ok(doc.includes(cmd), `no-leftovers.md must document \`${cmd}\``);
  }
  assert.ok(
    /push the branch before stopping/i.test(doc),
    "no-leftovers.md must state the never-local-only rule",
  );
});

test("every command that can leave a branch open cross-links no-leftovers.md", () => {
  for (const rel of ["commands/branch.md", "commands/merge.md", "commands/back-to-main.md", "commands/status.md"]) {
    assert.ok(references(read(rel), "no-leftovers.md"), `${rel} must cross-link references/no-leftovers.md`);
  }
});test("soft-rule 4 in safety.md gates `git reset --hard` on every local commit being reachable from origin", () => {
  const softRules = read("skills/git-flow/references/safety.md").split("## Abort message format")[0];
  assert.ok(/`git pull --ff-only` fails after merge/.test(softRules), "soft-rule 4 must still cover the `git pull --ff-only` failure case");
  assert.ok(
    /sanctioned.*only when.*every.*local.*commit.*reachable.*origin/i.test(softRules) ||
      /safe to `git reset --hard origin/.test(softRules),
    "soft-rule 4 must gate `git reset --hard` on the local-vs-origin commit check",
  );
});

test("language filter: commit messages, PR titles, and PR bodies stay free of blocked slang and jargon", () => {
  // Load the blocklist straight out of the rule doc so adding a token there
  // tightens every site. Only `- `token`` list items count — prose backticks
  // in the same section describe the whole-word rule and are not tokens.
  const blocklist = read("skills/git-flow/references/language.md")
    .split("## Blocklist")[1]
    .split("## How the workflow applies the rule")[0];
  const tokens = Array.from(blocklist.matchAll(/^- `([a-z][a-z-]*)`$/gm), (m) => m[1]);
  assert.ok(tokens.length > 0, "language.md must define at least one blocked token");
  assert.ok(
    /### Casual filler/.test(blocklist) && /### Development slang and jargon/.test(blocklist),
    "language.md blocklist must keep both the casual-filler and jargon lists",
  );

  // The strings that actually land in commits, PR titles, or PR bodies.
  const sites = [
    {
      label: "SKILL.md commit + PR sections",
      samples: extractQuotedStrings(read(SKILL_FILE)),
    },
    {
      label: "branch-naming.md conventional-commit section",
      samples: [
        ...extractQuotedStrings(read("skills/git-flow/references/branch-naming.md")),
        ...extractBacktickSamples(read("skills/git-flow/references/branch-naming.md")),
      ],
    },
    {
      label: "pr-template.md body markdown",
      samples: [
        ...extractMarkdownBodyBullets(read("skills/git-flow/references/pr-template.md")),
        ...extractBacktickSamples(read("skills/git-flow/references/pr-template.md")),
      ],
    },
    {
      label: "setup-ci.md scaffold commit + PR title",
      samples: extractQuotedStrings(read("skills/git-flow/references/setup-ci.md")),
    },
    {
      label: "commands/setup-ci.md commit subject",
      samples: extractQuotedStrings(read("commands/setup-ci.md")),
    },
  ];

  for (const token of tokens) {
    // A token is interpolated into a RegExp below. Constrain its shape so a
    // metacharacter can never reach the pattern builder as a syntax error.
    assert.match(token, /^[a-z][a-z-]*$/, `blocked token must be a plain lowercase word: ${JSON.stringify(token)}`);
    const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(token)}(?![A-Za-z0-9_])`, "i");
    for (const site of sites) {
      for (const sample of site.samples) {
        assert.ok(!re.test(sample), `${site.label} contains blocked token "${token}" in: ${JSON.stringify(sample)}`);
      }
    }
  }
});

test("step 4 uses the local check as the merge gate when Actions is unavailable", () => {
  const NOTICE = "no remote CI: Actions is unavailable for this repository; local check result was";
  for (const rel of ["skills/git-flow/references/ci-watch.md", SKILL_FILE]) {
    const md = read(rel);
    assert.ok(md.includes("actions/permissions"), `${rel} must detect Actions availability via repos/{owner}/{repo}/actions/permissions`);
    assert.ok(md.includes(NOTICE), `${rel} must print the Actions-unavailable notice carrying the local check result`);
    assert.ok(/step 2\.5/.test(md), `${rel} must name the step 2.5 local check as the merge gate`);
  }
  assert.ok(
    /Do \*\*not\*\* run `gh pr checks --watch`/.test(read("skills/git-flow/references/ci-watch.md")),
    "ci-watch.md must forbid the watch when Actions is unavailable",
  );
});

// Pull every `"..."` string out of a markdown file — the strings the agent
// passes to `git commit -m` or `--title`.
function extractQuotedStrings(md) {
  return Array.from(md.matchAll(/"([^"\n]+)"/g), (m) => m[1]);
}

// Pull every `` `...` `` string — the conventional-commit samples and squash
// title examples the docs present as literal text.
function extractBacktickSamples(md) {
  return Array.from(md.matchAll(/`([^`\n]+)`/g), (m) => m[1]);
}

// Pull every non-heading line inside ```markdown fences — the exact lines the
// workflow hands to `gh pr create --body-file`.
function extractMarkdownBodyBullets(md) {
  const out = [];
  for (const [, body] of md.matchAll(/```markdown\n([\s\S]*?)```/g)) {
    for (const line of body.split("\n")) {
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      out.push(line.replace(/^- /, "").trim());
    }
  }
  return out;
}
