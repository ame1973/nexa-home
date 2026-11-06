import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { fixtureEnvironment } from "./release-test-env.mjs";
import {
  buildVersion,
  command,
  nextVersion,
  planDigest,
  readPlan,
  sourceVersion,
  stampVersion,
  tagPlanMessage,
  recoverTagPlan,
  validatePlan,
} from "./release.mjs";
import { createPlan, validatePullRequest } from "./release-plan.mjs";

const directories = [];
after(() => {
  for (const directory of directories)
    rmSync(directory, { recursive: true, force: true });
});
const repository = "Owner/Nexa-Home";
function fixture({ released = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "nexa-semantic-test-"));
  directories.push(root);
  mkdirSync(join(root, "apps/web"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0", private: true }),
  );
  writeFileSync(
    join(root, "apps/web/package.json"),
    JSON.stringify({ name: "fixture-web", version: "1.0.0" }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      version: "1.0.0",
      packages: { "": { version: "1.0.0" }, "apps/web": { version: "1.0.0" } },
    }),
  );
  const git = (args) =>
    command(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        "-c",
        "user.name=Nexa Semantic Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        ...args,
      ],
      {
        cwd: root,
        env: {
          ...fixtureEnvironment(),
          GIT_AUTHOR_DATE: "2026-02-03T12:00:00+00:00",
          GIT_COMMITTER_DATE: "2026-02-03T12:00:00+00:00",
        },
      },
    );
  git(["init", "--initial-branch=master"]);
  git(["add", "."]);
  const commit = (message) => {
    git(["commit", "--allow-empty", "-m", message]);
    return git(["rev-parse", "HEAD"]);
  };
  const first = commit("chore: create synthetic fixture");
  const releases = released
    ? [{ tag_name: "v1.4.2", draft: false, prerelease: false }]
    : [];
  if (released)
    git(["tag", "-a", "v1.4.2", "-m", "Synthetic released version"]);
  const plan = (options) =>
    createPlan({
      repository,
      root,
      revision: git(["rev-parse", "HEAD"]),
      releases,
      ...options,
    });
  return { root, git, commit, releases, first, plan };
}

for (const [message, version, type] of [
  ["fix: correct a synthetic defect", "1.4.3", "patch"],
  ["perf(search): reduce synthetic work", "1.4.3", "patch"],
  ["feat: add a synthetic feature", "1.5.0", "minor"],
  ["feat!: change synthetic behavior", "2.0.0", "major"],
  ["fix(api)!: change a synthetic contract", "2.0.0", "major"],
  [
    "docs: explain migration\n\nBREAKING CHANGE: synthetic callers must migrate",
    "2.0.0",
    "major",
  ],
])
  test(`official Conventional Commits analysis: ${message.split("\n")[0]}`, async () => {
    const input = fixture();
    input.commit(message);
    const plan = await input.plan();
    assert.equal(plan.version, version);
    assert.equal(plan.type, type);
    assert.equal(plan.date, "2026-02-03");
    assert.match(plan.notes, /2026-02-03/);
    assert.match(
      plan.notes,
      new RegExp(`compare/v1.4.2\\.\\.\\.v${version.replaceAll(".", "\\.")}`),
    );
  });

for (const type of [
  "docs",
  "test",
  "ci",
  "chore",
  "refactor",
  "build",
  "style",
])
  test(`${type}-only changes verify without a release`, async () => {
    const input = fixture();
    input.commit(`${type}: change a synthetic development detail`);
    const plan = await input.plan();
    assert.equal(plan.version, null);
    assert.equal(plan.type, "none");
    assert.equal(plan.notes, "");
  });

test("one release uses the highest change and notes include commits, issues and compare links", async () => {
  const input = fixture();
  const hash = input.commit("fix(api): correct a synthetic issue (#12)");
  input.commit("feat(ui): add a synthetic feature (#13)");
  input.commit("perf: improve synthetic search");
  input.commit("docs: hidden development instructions");
  const plan = await input.plan();
  assert.equal(plan.version, "1.5.0");
  assert.match(plan.notes, /Features/);
  assert.match(plan.notes, /Bug Fixes/);
  assert.match(plan.notes, /Performance/);
  assert.ok(
    plan.notes.includes(`https://github.com/${repository}/commit/${hash}`),
  );
  assert.ok(plan.notes.includes(`https://github.com/${repository}/issues/12`));
  assert.equal(plan.notes.includes("hidden development instructions"), false);
  assert.deepEqual(
    await input.plan(),
    plan,
    "A retry has stable notes/date/version",
  );
});

test("breaking descriptions are preserved even on otherwise hidden commit types", async () => {
  const input = fixture();
  input.commit(
    "refactor!: simplify synthetic structure\n\nBREAKING CHANGE: use the new synthetic field",
  );
  const plan = await input.plan();
  assert.equal(plan.version, "2.0.0");
  assert.match(plan.notes, /BREAKING CHANGES/);
  assert.match(plan.notes, /use the new synthetic field/);
});

test("a feature reverted in the same range creates no release", async () => {
  const input = fixture();
  const hash = input.commit("feat: add a synthetic reversible feature");
  input.commit(
    `revert: feat: add a synthetic reversible feature\n\nThis reverts commit ${hash}.`,
  );
  assert.equal((await input.plan()).version, null);
});

test("the first actual release is 1.0.0, not an increment of the development package version", async () => {
  const input = fixture({ released: false });
  input.commit("feat!: initialize a synthetic product");
  const plan = await input.plan();
  assert.equal(plan.version, "1.0.0");
  assert.equal(plan.type, "initial");
  assert.equal(plan.base, null);
  assert.equal(sourceVersion(input.root), "1.0.0");
});

test("drafts, prereleases and unrelated published tags cannot become the automatic baseline", async () => {
  const input = fixture();
  const target = input.commit("feat: add a later synthetic change");
  input.git(["tag", "v1.5.0"]);
  input.releases.push({ tag_name: "v1.5.0", draft: false, prerelease: false });
  input.git(["checkout", "-b", "backport", input.first]);
  input.commit("fix: fix the earlier synthetic line");
  input.releases.push(
    { tag_name: "v9.0.0", draft: true },
    { tag_name: "v8.0.0-rc.1", prerelease: true },
    { tag_name: "nightly" },
  );
  const plan = await input.plan();
  assert.notEqual(plan.revision, target);
  assert.equal(plan.base.tag, "v1.4.2");
  assert.equal(plan.version, "1.4.3");
});

test("published tags must exist in full fetched history; missing history fails closed", async () => {
  const input = fixture();
  input.commit("feat: add synthetic work");
  input.releases.push({ tag_name: "v9.0.0", draft: false, prerelease: false });
  await assert.rejects(input.plan(), /git failed/);
});

test("manual prerelease/backport tags receive generated notes without consuming a new automatic version", async () => {
  const input = fixture();
  input.commit("fix: change synthetic behavior");
  input.git(["tag", "v1.4.3-rc.1"]);
  const plan = await input.plan({ tag: "v1.4.3-rc.1" });
  assert.equal(plan.version, "1.4.3-rc.1");
  assert.equal(plan.type, "manual");
  assert.equal(plan.mode, "tag");
  assert.match(plan.notes, /Bug Fixes/);
});

test("a newer explicit tag recovers a publisher code fix without moving an unfinished initial release", async () => {
  const input = fixture({ released: false });
  const originalSource = input.commit("feat: initialize a synthetic product");
  const original = await input.plan();
  input.git(["tag", "-a", "v1.0.0", "-m", tagPlanMessage(original)]);
  const originalObject = input.git(["rev-parse", "v1.0.0"]);
  input.releases.push({
    tag_name: "v1.0.0",
    draft: true,
    target_commitish: originalSource,
  });
  const fixedSource = input.commit(
    "fix(release): preserve synthetic OCI metadata",
  );
  await assert.rejects(
    input.plan(),
    /unfinished version belongs to another commit/,
  );
  input.git(["tag", "-a", "v1.0.1", "-m", "Synthetic corrected release"]);
  const manual = await input.plan({ tag: "v1.0.1" });
  assert.equal(manual.version, "1.0.1");
  assert.equal(manual.mode, "tag");
  assert.equal(manual.type, "manual");
  assert.equal(manual.revision, fixedSource);
  assert.equal(manual.base, null);
  assert.equal(input.git(["rev-parse", "v1.0.0"]), originalObject);
  input.releases.push({ tag_name: "v1.0.1", draft: false, prerelease: false });
  input.commit("fix: follow the successful synthetic release");
  const next = await input.plan();
  assert.equal(next.version, "1.0.2");
  assert.equal(next.base.tag, "v1.0.1");
});

test("rerunning a published release is a no-op and a foreign version cannot be reused", async () => {
  const input = fixture();
  const source = input.commit("feat: add a synthetic released feature");
  input.git(["tag", "v1.5.0"]);
  input.releases.push({ tag_name: "v1.5.0", draft: false, prerelease: false });
  assert.equal((await input.plan()).version, null);
  assert.equal((await input.plan({ tag: "v1.5.0" })).version, null);
  input.git(["checkout", "-b", "another-source", input.first]);
  input.commit("feat: make a different synthetic feature");
  await assert.rejects(input.plan(), /another commit/);
  assert.notEqual(input.git(["rev-parse", "HEAD"]), source);
});

test("an interrupted automatic release resumes the exact plan from its annotated tag, including tag dispatch", async () => {
  const input = fixture();
  input.commit("feat: add synthetic resumable behavior");
  const original = await input.plan();
  input.git([
    "tag",
    "-a",
    `v${original.version}`,
    "-m",
    tagPlanMessage(original),
  ]);
  assert.deepEqual(await input.plan(), original);
  assert.deepEqual(await input.plan({ tag: `v${original.version}` }), original);
  assert.deepEqual(
    recoverTagPlan(tagPlanMessage(original), original),
    original,
  );
  assert.throws(
    () =>
      recoverTagPlan(
        tagPlanMessage(original).replace("synthetic resumable", "tampered"),
      ),
    /digest mismatch/,
  );
  input.commit("feat: add later synthetic behavior");
  await assert.rejects(
    input.plan(),
    /unfinished version belongs to another commit/,
  );
});

test("automatic planning never adopts an existing manually managed version tag", async () => {
  const input = fixture();
  input.commit("feat: add synthetic behavior");
  input.git(["tag", "v1.5.0"]);
  await assert.rejects(input.plan(), /manually managed tag/);
  assert.equal((await input.plan({ tag: "v1.5.0" })).mode, "tag");
});

test("version arithmetic is validated, resets smaller components and preserves large integers", () => {
  assert.equal(nextVersion("1.4.2", "patch"), "1.4.3");
  assert.equal(nextVersion("1.4.2", "minor"), "1.5.0");
  assert.equal(nextVersion("1.4.2", "major"), "2.0.0");
  assert.equal(
    nextVersion("9007199254740993.8.9", "major"),
    "9007199254740994.0.0",
  );
  assert.throws(() => nextVersion("1.0.0-rc.1", "patch"));
  assert.throws(() => nextVersion("1.0.0", "arbitrary"));
});

for (const title of [
  "feat: add synthetic behavior",
  "fix(api)!: change the synthetic contract",
  "ci: update synthetic checks",
  "docs: clarify synthetic use",
])
  test(`PR title accepts ${title}`, () => validatePullRequest(title));
for (const title of [
  "Add synthetic behavior",
  "feature: add synthetic behavior",
  "feat:no space",
  "feat(): empty scope",
  "fix: ",
  "feat: synthetic\nBREAKING CHANGE: injected",
  "feat: " + "x".repeat(256),
  null,
])
  test(`PR title rejects ${JSON.stringify(title)}`, () =>
    assert.rejects(validatePullRequest(title)));

test("source builds use exact tags or explicit build versions without persisting release commits", () => {
  const input = fixture();
  assert.equal(buildVersion({ root: input.root, env: {} }), "1.4.2");
  assert.equal(sourceVersion(input.root), "1.0.0");
  input.commit("fix: untagged synthetic work");
  assert.equal(buildVersion({ root: input.root, env: {} }), "1.0.0");
  const env = { NEXA_BUILD_VERSION: "2.3.4-rc.1" };
  assert.equal(buildVersion({ root: input.root, env }), "2.3.4-rc.1");
  stampVersion("2.3.4-rc.1", input.root);
  assert.equal(sourceVersion(input.root), "2.3.4-rc.1");
  assert.equal(
    input.git(["log", "-1", "--format=%s"]),
    "fix: untagged synthetic work",
  );
  assert.throws(() =>
    buildVersion({ root: input.root, env: { NEXA_BUILD_VERSION: "1.0.0;id" } }),
  );
  input.git(["tag", "v2.3.4"]);
  input.git(["tag", "v2.3.5"]);
  assert.throws(
    () => buildVersion({ root: input.root, env: {} }),
    /Multiple version tags/,
  );
});

test("plan identity includes notes, baseline, source, date and mode; malformed/linked/oversized plans fail", async () => {
  const input = fixture();
  input.commit("feat: add a synthetic feature");
  const plan = await input.plan();
  const file = join(input.root, "plan.json");
  writeFileSync(file, JSON.stringify(plan));
  const digest = planDigest(plan);
  assert.deepEqual(
    readPlan(file, {
      repository,
      revision: plan.revision,
      version: plan.version,
      digest,
    }),
    plan,
  );
  for (const change of [
    { notes: plan.notes + "Changed notes" },
    { revision: "f".repeat(40) },
    { date: "2026-02-04" },
    { base: { ...plan.base, revision: "f".repeat(40) } },
  ]) {
    writeFileSync(file, JSON.stringify({ ...plan, ...change }));
    assert.throws(() => readPlan(file, { digest }), /digest mismatch/);
  }
  for (const change of [
    { extra: "not allowed" },
    { schema: 2 },
    { repository: "owner/../../other" },
    { version: "1.0.0\n" },
    { date: "2026-02-30" },
    { revision: plan.revision + "\n" },
    { notes: "x".repeat(65537) },
    { notes: "bad\u0000notes" },
    { mode: "unknown" },
  ])
    assert.throws(() => validatePlan({ ...plan, ...change }));
  writeFileSync(file, "x".repeat(128 * 1024 + 1));
  assert.throws(() => readPlan(file), /bounded regular file/);
  rmSync(file);
  symlinkSync(join(input.root, "package.json"), file);
  assert.throws(() => readPlan(file), /bounded regular file/);
});

for (const [event, refType, dispatch, publish] of [
  ["push", "branch", "", true],
  ["workflow_dispatch", "branch", "preview", false],
  ["push", "tag", "", true],
  ["workflow_dispatch", "tag", "preview", false],
  ["workflow_dispatch", "tag", "resume", true],
])
  test(`planner CLI ${event}/${refType}/${dispatch || "automatic"} binds its plan and publication intent`, () => {
    const input = fixture();
    const revision = input.commit("feat: add a synthetic CLI feature (#17)");
    if (refType === "tag")
      input.git(["tag", "-a", "v1.5.0", "-m", "Manual synthetic release"]);
    const bin = join(input.root, "cli-tools");
    mkdirSync(bin);
    const history = join(bin, "history.json");
    writeFileSync(history, JSON.stringify(input.releases));
    writeFileSync(
      join(bin, "gh"),
      `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);if(args[0]!=='api'||!args.includes('--paginate')||!args.at(-1).endsWith('/releases?per_page=100'))process.exit(9);process.stdout.write(JSON.stringify([JSON.parse(fs.readFileSync(process.env.NEXA_FIXTURE_HISTORY,'utf8'))]));\n`,
      { mode: 0o555 },
    );
    const output = join(input.root, "workflow-output");
    const env = {
      ...fixtureEnvironment(),
      PATH: `${bin}:${process.env.PATH}`,
      NEXA_FIXTURE_HISTORY: history,
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: event,
      GITHUB_REF_TYPE: refType,
      GITHUB_REF_NAME: refType === "tag" ? "v1.5.0" : "master",
      GITHUB_SHA: revision,
      GITHUB_REPOSITORY: repository,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(input.root, "step-summary"),
      NEXA_RELEASE_MODE: dispatch,
      GH_TOKEN: "synthetic-not-a-live-token",
      NEXA_RELEASE_PLAN_DIGEST: "",
      NEXA_BUILD_VERSION: "",
    };
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/release-plan.mjs"), "plan"],
      { cwd: input.root, encoding: "utf8", env },
    );
    assert.equal(result.status, 0, result.stderr);
    const values = Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("=")),
    );
    const plan = readPlan(join(input.root, "release-plan/plan.json"), {
      repository,
      revision,
      digest: values.plan_digest,
    });
    assert.equal(values.version, "1.5.0");
    assert.equal(values.publish, String(publish));
    assert.equal(values.has_release, "true");
    const metadata = spawnSync(
      process.execPath,
      [resolve("scripts/release.mjs"), "metadata"],
      {
        cwd: input.root,
        encoding: "utf8",
        env: { ...env, NEXA_RELEASE_PLAN_DIGEST: values.plan_digest },
      },
    );
    assert.equal(metadata.status, 0, metadata.stderr);
    const preview = spawnSync(
      process.execPath,
      [resolve("scripts/release.mjs"), "publish"],
      {
        cwd: input.root,
        encoding: "utf8",
        env: {
          ...env,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          NEXA_RELEASE_MODE: "preview",
          NEXA_RELEASE_PLAN_DIGEST: values.plan_digest,
        },
      },
    );
    assert.notEqual(preview.status, 0);
    assert.match(preview.stderr, /Preview mode cannot publish/);
    if (event === "push" && refType === "branch") {
      for (const changed of [
        { NEXA_RELEASE_PLAN_DIGEST: "e".repeat(64) },
        { GITHUB_REPOSITORY: "other/repository" },
        { GITHUB_REPOSITORY: "" },
        { GITHUB_REF_NAME: "untrusted-branch" },
      ]) {
        const rejected = spawnSync(
          process.execPath,
          [resolve("scripts/release.mjs"), "metadata"],
          {
            cwd: input.root,
            encoding: "utf8",
            env: {
              ...env,
              NEXA_RELEASE_PLAN_DIGEST: values.plan_digest,
              ...changed,
            },
          },
        );
        assert.notEqual(
          rejected.status,
          0,
          "Foreign workflow context must not accept a plan",
        );
      }
    }
    const stamped = spawnSync(
      process.execPath,
      [resolve("scripts/release.mjs"), "stamp"],
      {
        cwd: input.root,
        encoding: "utf8",
        env: { ...env, NEXA_BUILD_VERSION: plan.version },
      },
    );
    assert.equal(stamped.status, 0);
    assert.equal(sourceVersion(input.root), "1.5.0");
    assert.equal(
      input.git(["rev-parse", "HEAD"]),
      revision,
      "Build stamping never commits a new source revision",
    );
  });

test("planner CLI rejects PR publication and unexpected arguments before network access", () => {
  const script = resolve("scripts/release-plan.mjs");
  for (const args of [["plan"], ["plan", "extra"]]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      env: {
        ...fixtureEnvironment(),
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "pull_request",
      },
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /Only release events|Unexpected planner arguments/,
    );
  }
});
