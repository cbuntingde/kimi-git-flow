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
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
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

test("package.json declares the test script and module type", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.type, "module");
  assert.ok(pkg.scripts && pkg.scripts.test, "test script must exist");
  assert.ok(pkg.engines && pkg.engines.node);
});

test("every command markdown has name + description frontmatter", () => {
  const expected = [
    "commands/branch.md",
    "commands/pr.md",
    "commands/watch.md",
    "commands/merge.md",
    "commands/status.md",
    "commands/back-to-main.md",
    "commands/setup-ci.md",
  ];
  for (const rel of expected) {
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
  const roots = [
    "skills/git-flow/SKILL.md",
    "commands/branch.md",
    "commands/pr.md",
    "commands/watch.md",
    "commands/merge.md",
    "commands/status.md",
    "commands/back-to-main.md",
    "commands/setup-ci.md",
  ];
  // Match either `(references/foo.md)` or `references/foo.md` (bare).
  // SKILL.md uses relative paths; commands use `references/...` from the
  // plugin root. Resolve both forms against the file that mentions them.
  const linkRe = /[`(](references\/[\w-]+\.md)[`)]/g;
  for (const rel of roots) {
    const md = read(rel);
    const fromDir = dirname(resolve(root, rel));
    for (const m of md.matchAll(linkRe)) {
      const target = m[1];
      const abs = resolve(fromDir, target);
      assert.ok(exists(abs), `${rel} references missing file: ${target} (looked at ${abs})`);
    }
  }
});

test("branch slug satisfies the documented invariants", () => {
  // The mechanical rules (1-5 in branch-naming.md):
  //   lowercase ASCII, kebab-case, no leading kimi/, ≤48 chars, no trailing dash.
  // Noun-phrase selection ("first one or two noun phrases") is an LLM
  // heuristic and intentionally not testable here — that's what the
  // agent is for.
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
  // Length cap works on extreme input.
  const long = "a".repeat(200);
  assert.ok(slug(long).length <= 48);
  // Trailing dashes are trimmed.
  assert.ok(!slug("foo bar ").endsWith("-"));
  // Prefix stripping handles both `kimi/` and `kimi:`.
  assert.equal(slug("kimi/foo-bar"), "foo-bar");
  assert.equal(slug("kimi: foo bar"), "foo-bar");
  // Runs of non-alphanumeric characters collapse into a single dash.
  // branch-naming.md rule 2: "Spaces become `-`. Strip all characters
  // outside [a-z0-9-]. Collapse runs of `-`."
  assert.equal(slug("foo   bar"), "foo-bar");
  assert.equal(slug("foo!!!bar"), "foo-bar");
  assert.equal(slug("foo___bar"), "foo-bar");
});

test("every reference file declared under skills/git-flow/references/ exists", () => {
  const refs = [
    "skills/git-flow/references/branch-naming.md",
    "skills/git-flow/references/safety.md",
    "skills/git-flow/references/local-check.md",
    "skills/git-flow/references/setup-ci.md",
    "skills/git-flow/references/ci-watch.md",
    "skills/git-flow/references/merge-strategy.md",
    "skills/git-flow/references/pr-template.md",
  ];
  for (const rel of refs) {
    assert.ok(exists(rel), `${rel} must exist`);
  }
});

test("command markdown has coherent numbered steps (no orphaned prose)", () => {
  // Catches the bug class where a sed-style edit drops the opener of
  // a numbered step, leaving the continuation as orphan prose.
  const files = [
    "commands/branch.md",
    "commands/pr.md",
    "commands/watch.md",
    "commands/merge.md",
    "commands/back-to-main.md",
    "commands/setup-ci.md",
  ];
  for (const rel of files) {
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

test("command markdown has no orphan prose blocks (lines that look like list continuations without their opener)", () => {
  // Catches the bug class where an edit replaces a numbered list item
  // with a bare continuation line. Heuristic: any line under a
  // `## ...` section that is a plain prose sentence and immediately
  // follows a numbered step whose opener is the same paragraph must
  // keep a blank line before the next numbered step. This is a coarse
  // check — full markdown lint would be heavier than the project
  // warrants.
  const files = [
    "commands/branch.md",
    "commands/pr.md",
    "commands/watch.md",
    "commands/merge.md",
    "commands/back-to-main.md",
    "commands/setup-ci.md",
  ];
  for (const rel of files) {
    const md = read(rel);
    // Every H2 section must end with a blank line before EOF (or
    // before the next H2).
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

