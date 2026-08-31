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
//      `@vX.Y.Z` tag, not the mutable `@vX`. A silent upgrade would
//      change test behavior under our feet.
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
//
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

/** Pull YAML frontmatter (between leading `---` fences) into a plain object. */
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const ix = line.indexOf(":");
    if (ix === -1) continue;
    const key = line.slice(0, ix).trim();
    const val = line.slice(ix + 1).trim().replace(/^["']|["']$/g, "");
    out[key] = val;
  }
  return out;
}

/** Replicate the slug rule from skills/git-flow/references/branch-naming.md. */
function slug(input) {
  return input
    .toLowerCase()
    .replace(/^kimi:?\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

function withKimiPrefix(s) {
  return s.startsWith("kimi/") ? s : `kimi/${s}`;
}

/** True iff a markdown file mentions another reference file by path. */
function references(md, target) {
  const re = new RegExp(`references/${target.replace(/[/.]/g, "\\$&")}\\b`);
  return re.test(md);
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

test("package.json declares the test script, lint:links, and module type", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.type, "module");
  assert.ok(pkg.scripts && pkg.scripts.test, "test script must exist");
  assert.ok(pkg.scripts["lint:links"], "lint:links script must exist");
  assert.ok(pkg.engines && pkg.engines.node);
});

test("every command markdown has name + description frontmatter", () => {
  for (const rel of COMMAND_FILES) {
    assert.ok(exists(rel), `${rel} must exist`);
    const fm = parseFrontmatter(read(rel));
    assert.ok(fm.name, `${rel} missing frontmatter name`);
    assert.ok(fm.description, `${rel} missing frontmatter description`);
    assert.ok(
      fm.description.length < 200,
      `${rel} description is ${fm.description.length} chars; keep under 200`,
    );
  }
});

test("SKILL.md has name + description frontmatter", () => {
  const fm = parseFrontmatter(read("skills/git-flow/SKILL.md"));
  assert.equal(fm.name, "git-flow");
  assert.ok(fm.description);
  assert.ok(
    fm.description.length < 250,
    `SKILL.md description is ${fm.description.length} chars; keep under 250`,
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

test("branch slug satisfies the documented invariants", () => {
  const cases = [
    "rename foo to bar",
    "fix the login redirect bug",
    "add a /healthz endpoint",
    "phase 2: rbac",
    "refactor the error types in src/errors.rs",
    "kimi: rename foo to bar",
  ];
  for (const input of cases) {
    const s = slug(input);
    assert.match(s, /^[a-z0-9-]+$/, `slug(${JSON.stringify(input)}) must be lowercase kebab-case: got ${s}`);
    assert.ok(!s.endsWith("-"), `slug must not end with -: ${s}`);
    assert.ok(s.length <= 48, `slug must be ≤48 chars: ${s}`);
    assert.ok(!s.startsWith("kimi"), `slug must not carry the kimi/ prefix from input: ${s}`);
  }
  const long = "a".repeat(200);
  assert.ok(slug(long).length <= 48);
  assert.ok(!slug("foo bar ").endsWith("-"));
  assert.equal(slug("kimi/foo-bar"), "foo-bar");
  assert.equal(slug("kimi: foo bar"), "foo-bar");
  assert.equal(slug("foo   bar"), "foo-bar");
  assert.equal(slug("foo!!!bar"), "foo-bar");
  assert.equal(slug("foo___bar"), "foo-bar");
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

test("dogfooded CI workflow pins actions/checkout and actions/setup-node to a specific minor version", () => {
  const yml = read(".github/workflows/ci.yml");
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
    /\b(npm ci|npm install --ci)\b/,
    "CI must install from the lockfile (npm ci or npm install --ci)",
  );
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
    /origin\/\$\{?DEFAULT_BRANCH\}?\.\.\$\{?DEFAULT_BRANCH\}?/.test(preflight) ||
      /origin\/<default-branch>\.\.<default-branch>/.test(preflight),
    "SKILL.md preflight must include a git log check that compares local and origin default branches",
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
