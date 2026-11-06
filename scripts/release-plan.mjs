import assert from "node:assert/strict";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import conventionalCommits from "conventional-changelog-conventionalcommits";
import {
  command,
  compareVersions,
  parseVersion,
  planDigest,
  releaseHistory,
  releaseMetadata,
  validatePlan,
  workflowRevision,
} from "./release.mjs";

export const releaseBranch = "master";
const preset = { preset: "conventionalcommits", presetConfig: {} };
const logger = { log() {} }; // Commit messages are data, not diagnostic output.

function tagVersion(tag) {
  if (typeof tag !== "string" || !tag.startsWith("v")) return null;
  try {
    return parseVersion(tag.slice(1));
  } catch {
    return null;
  }
}

export function nextVersion(previous, type) {
  assert.ok(["major", "minor", "patch"].includes(type));
  if (!previous) return "1.0.0";
  const parsed = parseVersion(previous);
  assert.equal(parsed.prerelease, "", "Automatic releases use stable versions");
  const parts = parsed.parts.map(BigInt);
  const index = ["major", "minor", "patch"].indexOf(type);
  parts[index]++;
  for (let position = index + 1; position < 3; position++) parts[position] = 0n;
  return parseVersion(parts.join(".")).version;
}

export function publishedBase({
  releases,
  revision,
  version,
  root = ".",
  run = command,
}) {
  assert.ok(Array.isArray(releases), "Expected the release history");
  const candidates = releases
    .filter((release) => {
      const parsed = tagVersion(release.tag_name);
      return (
        parsed &&
        !release.draft &&
        !release.prerelease &&
        !parsed.prerelease &&
        (!version || compareVersions(parsed.version, version) < 0)
      );
    })
    .sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
  for (const release of candidates) {
    const target = run(
      "git",
      ["rev-parse", "--verify", `refs/tags/${release.tag_name}^{commit}`],
      { cwd: root },
    );
    assert.match(target, /^[0-9a-f]{40}$/);
    assert.equal(target.length, 40);
    // A published tag outside this source's ancestry is not its release baseline.
    const outside = run(
      "git",
      ["rev-list", "--count", target, "--not", revision],
      { cwd: root },
    );
    assert.match(outside, /^\d+$/);
    if (outside === "0") return { tag: release.tag_name, revision: target };
  }
  return null;
}

export function releaseCommits({ base, revision, root = ".", run = command }) {
  const range = base ? `${base.revision}..${revision}` : revision;
  const fields = run(
    "git",
    ["log", "--no-show-signature", "--format=%H%x00%B%x00", range],
    { cwd: root },
  ).split("\0");
  assert.equal(fields.length % 2, 1, "Invalid Git commit record");
  assert.ok(
    fields.length <= 20001,
    "A release may include at most 10000 commits",
  );
  const commits = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const hash = fields[index].trim();
    assert.ok(
      hash.length === 40 && /^[0-9a-f]+$/.test(hash),
      "Invalid commit identity",
    );
    commits.push({ hash, message: fields[index + 1].trim() });
  }
  return commits;
}

export async function createPlan({
  repository,
  revision,
  tag,
  releases,
  root = ".",
  run = command,
}) {
  releaseMetadata({ repository, revision, tag: tag || "v1.0.0" });
  const mode = tag ? "tag" : "auto";
  const selected = tag ? tagVersion(tag).version : undefined;
  const base = publishedBase({
    releases,
    revision,
    version: selected,
    root,
    run,
  });
  const commits = releaseCommits({ base, revision, root, run });
  const type = await analyzeCommits(preset, {
    commits,
    cwd: resolve(root),
    logger,
  });
  const version =
    selected || (type ? nextVersion(base?.tag.slice(1), type) : null);
  const timestamp = run("git", ["show", "-s", "--format=%cI", revision], {
    cwd: root,
  });
  const date = new Date(timestamp).toISOString().slice(0, 10);
  const existing =
    version &&
    releases.find(
      (release) => !release.draft && release.tag_name === `v${version}`,
    );
  if (existing) {
    const target = run(
      "git",
      ["rev-parse", "--verify", `refs/tags/v${version}^{commit}`],
      { cwd: root },
    );
    assert.equal(
      target,
      revision,
      "The release version already belongs to another commit",
    );
  }
  const planned = existing ? null : version;
  const notes = planned
    ? await generateNotes(
        {
          ...preset,
          writerOpts: { finalizeContext: (context) => ({ ...context, date }) },
        },
        {
          cwd: resolve(root),
          commits,
          logger,
          options: { repositoryUrl: `https://github.com/${repository}` },
          lastRelease: base ? { gitTag: base.tag, gitHead: base.revision } : {},
          nextRelease: {
            version: planned,
            gitTag: `v${planned}`,
            gitHead: revision,
          },
        },
      )
    : "";
  return validatePlan({
    schema: 1,
    repository,
    revision,
    mode,
    base,
    date,
    version: planned,
    type: !planned ? "none" : tag ? "manual" : base ? type : "initial",
    notes,
  });
}

export async function validatePullRequest(title) {
  assert.ok(
    typeof title === "string" &&
      title.length <= 256 &&
      !/[\x00-\x1f\x7f]/.test(title),
    "Invalid PR title",
  );
  const parser = (await conventionalCommits({})).parser;
  const match = parser.headerPattern.exec(title);
  assert.ok(
    match &&
      match[3]?.trim() &&
      match[2] !== "" &&
      [
        "feat",
        "fix",
        "perf",
        "revert",
        "docs",
        "test",
        "ci",
        "chore",
        "refactor",
        "build",
        "style",
      ].includes(match[1]),
    "Use a Conventional Commits PR title, such as feat: add a feature or fix!: change behavior",
  );
}

async function main() {
  const [operation, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, "Unexpected planner arguments");
  if (operation === "check-pr") {
    assert.equal(process.env.GITHUB_EVENT_NAME, "pull_request");
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    await validatePullRequest(event.pull_request?.title);
    console.log(
      "The PR title follows Conventional Commits. Use squash merge with the PR description.",
    );
    return;
  }
  assert.equal(operation, "plan", "Use release-plan.mjs plan or check-pr");
  assert.equal(
    process.env.GITHUB_ACTIONS,
    "true",
    "Planning is restricted to the release workflow",
  );
  const event = process.env.GITHUB_EVENT_NAME;
  assert.ok(
    ["push", "workflow_dispatch"].includes(event),
    "Only release events can plan a publication",
  );
  const dispatch = process.env.NEXA_RELEASE_MODE || "preview";
  assert.ok(
    ["preview", "resume"].includes(dispatch),
    "Invalid release dispatch mode",
  );
  const tagged = process.env.GITHUB_REF_TYPE === "tag";
  if (!tagged) {
    assert.equal(process.env.GITHUB_REF_TYPE, "branch");
    assert.equal(
      process.env.GITHUB_REF_NAME,
      releaseBranch,
      "Only master can plan an automatic release",
    );
    assert.ok(
      event !== "workflow_dispatch" || dispatch === "preview",
      "Resume must select the exact existing version tag",
    );
  }
  const revision = workflowRevision();
  const repository = process.env.GITHUB_REPOSITORY;
  releaseMetadata({
    repository,
    revision,
    tag: tagged ? process.env.GITHUB_REF_NAME : "v1.0.0",
  });
  const plan = await createPlan({
    repository,
    revision,
    tag: tagged ? process.env.GITHUB_REF_NAME : undefined,
    releases: releaseHistory(repository),
  });
  mkdirSync("release-plan", { recursive: true });
  writeFileSync(
    "release-plan/plan.json",
    JSON.stringify(plan, null, 2) + "\n",
    { flag: "wx" },
  );
  const publish = Boolean(
    plan.version && (event === "push" || dispatch === "resume"),
  );
  assert.ok(process.env.GITHUB_OUTPUT, "GITHUB_OUTPUT is required");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `version=${plan.version || ""}`,
      `revision=${revision}`,
      `plan_digest=${planDigest(plan)}`,
      `publish=${publish}`,
      `has_release=${Boolean(plan.version)}`,
    ]
      .map((value) => value + "\n")
      .join(""),
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Release plan\n\nSource: \`${revision}\`\n\n${plan.version ? `Version: \`v${plan.version}\` (${plan.type})\n\n${plan.notes}` : "No releasable changes; verification still runs."}\n\n${publish ? "Publication follows full verification and the release environment gate." : "Preview only: no tag, registry or Release writes."}\n`,
    );
  console.log(
    plan.version
      ? `Planned v${plan.version} (${plan.type}); publish=${publish}.`
      : "No new release; verification still runs.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
