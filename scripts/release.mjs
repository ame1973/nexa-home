import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const architectures = ["amd64", "arm64"];
const digestPattern = /^sha256:[0-9a-f]{64}$/;

export function parseVersion(value) {
  assert.equal(typeof value, "string", "A release version is required");
  assert.ok(
    value.length <= 128 && !/[^\x21-\x7e]/.test(value),
    "Invalid version characters or length",
  );
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value,
    );
  assert.ok(
    match,
    "Use MAJOR.MINOR.PATCH with an optional SemVer prerelease, without build metadata",
  );
  const prerelease = match[4] || "";
  for (const identifier of prerelease.split("."))
    assert.ok(
      !/^\d+$/.test(identifier) ||
        identifier === "0" ||
        !identifier.startsWith("0"),
      "Numeric prerelease identifiers must not have leading zeroes",
    );
  return { version: value, parts: match.slice(1, 4), prerelease };
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index++) {
    const difference = BigInt(a.parts[index]) - BigInt(b.parts[index]);
    if (difference) return difference > 0n ? 1 : -1;
  }
  if (!a.prerelease || !b.prerelease)
    return a.prerelease === b.prerelease ? 0 : a.prerelease ? -1 : 1;
  const first = a.prerelease.split(".");
  const second = b.prerelease.split(".");
  for (let index = 0; index < Math.max(first.length, second.length); index++) {
    const x = first[index];
    const y = second[index];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    if (numericX && numericY) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
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

export function sourceVersion(root = ".") {
  const json = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
  const version = parseVersion(json("package.json").version).version;
  const lock = json("package-lock.json");
  assert.equal(
    json("apps/web/package.json").version,
    version,
    "Workspace and root versions must match",
  );
  assert.equal(lock.version, version, "Lockfile and root versions must match");
  assert.equal(
    lock.packages[""].version,
    version,
    "Locked root version must match",
  );
  assert.equal(
    lock.packages["apps/web"].version,
    version,
    "Locked workspace version must match",
  );
  return version;
}

export function buildVersion({
  root = ".",
  env = process.env,
  run = command,
} = {}) {
  const development = sourceVersion(root);
  if (env.NEXA_BUILD_VERSION)
    return parseVersion(env.NEXA_BUILD_VERSION).version;
  if (env.GITHUB_ACTIONS === "true" && env.GITHUB_REF_TYPE === "tag") {
    assert.ok(env.GITHUB_REF_NAME?.startsWith("v"), "Expected a version tag");
    return parseVersion(env.GITHUB_REF_NAME.slice(1)).version;
  }
  let tags;
  try {
    tags = run("git", ["tag", "--points-at", "HEAD"], { cwd: root }).split(
      "\n",
    );
  } catch {
    return development; // Source archives need no Git installation or history.
  }
  const versions = tags.flatMap((tag) => {
    if (!tag.startsWith("v")) return [];
    try {
      return [parseVersion(tag.slice(1)).version];
    } catch {
      return [];
    }
  });
  assert.ok(
    versions.length <= 1,
    "Multiple version tags: set NEXA_BUILD_VERSION explicitly",
  );
  return versions[0] || development;
}

export function stampVersion(version, root = ".") {
  parseVersion(version);
  sourceVersion(root);
  for (const name of [
    "package.json",
    "apps/web/package.json",
    "package-lock.json",
  ]) {
    const file = join(root, name);
    const value = JSON.parse(readFileSync(file, "utf8"));
    value.version = version;
    if (name === "package-lock.json") {
      value.packages[""].version = version;
      value.packages["apps/web"].version = version;
    }
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
  }
  assert.equal(sourceVersion(root), version);
}

export function releaseMetadata({ tag, repository, revision }) {
  assert.ok(
    typeof tag === "string" && tag.startsWith("v"),
    "Release tags must start with v",
  );
  const parsed = parseVersion(tag.slice(1));
  assert.match(
    revision,
    /^[0-9a-f]{40}$/,
    "A full source commit SHA is required",
  );
  assert.equal(
    revision.length,
    40,
    "The source commit must not contain a trailing newline",
  );
  assert.ok(
    typeof repository === "string" &&
      repository.length <= 255 &&
      !/[^\x21-\x7e]/.test(repository),
    "Invalid repository",
  );
  const imagePath = repository.toLowerCase();
  assert.match(
    imagePath,
    /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/,
    "The repository must be a valid GHCR owner/image path",
  );
  return {
    tag,
    version: parsed.version,
    prerelease: Boolean(parsed.prerelease),
    repository,
    revision,
    image: `ghcr.io/${imagePath}`,
    source: `https://github.com/${repository}`,
  };
}

export function validatePlan(value) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "Invalid release plan",
  );
  assert.deepEqual(Object.keys(value).sort(), [
    "base",
    "date",
    "mode",
    "notes",
    "repository",
    "revision",
    "schema",
    "type",
    "version",
  ]);
  const {
    schema,
    repository,
    revision,
    mode,
    base,
    date,
    version,
    type,
    notes,
  } = value;
  assert.equal(schema, 1, "Unsupported release plan");
  releaseMetadata({ repository, revision, tag: `v${version || "1.0.0"}` });
  assert.ok(["auto", "tag"].includes(mode), "Invalid release mode");
  assert.ok(
    typeof date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date,
    "Invalid release date",
  );
  assert.ok(
    typeof notes === "string" &&
      Buffer.byteLength(notes) <= 65536 &&
      !/[\x00-\x08\x0b-\x1f\x7f]/.test(notes),
    "Invalid release notes",
  );
  let previous = null;
  if (base !== null) {
    assert.ok(base && typeof base === "object" && !Array.isArray(base));
    assert.deepEqual(Object.keys(base).sort(), ["revision", "tag"]);
    releaseMetadata({ repository, revision: base.revision, tag: base.tag });
    assert.equal(parseVersion(base.tag.slice(1)).prerelease, "");
    previous = { tag: base.tag, revision: base.revision };
  }
  if (version === null) {
    assert.equal(type, "none");
    assert.equal(notes, "");
  } else {
    const parsed = parseVersion(version);
    assert.ok(notes.trim(), "Release notes must not be empty");
    if (mode === "tag") assert.equal(type, "manual");
    else {
      assert.equal(parsed.prerelease, "");
      if (!previous) {
        assert.equal(type, "initial");
        assert.equal(version, "1.0.0");
      } else {
        assert.equal(
          version,
          nextVersion(previous.tag.slice(1), type),
          "Release type and version mismatch",
        );
      }
    }
  }
  // Canonical field order makes the plan identity independent of JSON formatting.
  return {
    schema,
    repository,
    revision,
    mode,
    base: previous,
    date,
    version,
    type,
    notes,
  };
}

export function planDigest(plan) {
  return createHash("sha256")
    .update(JSON.stringify(validatePlan(plan)))
    .digest("hex");
}

export function readPlan(file = "release-plan/plan.json", expected = {}) {
  const stat = lstatSync(file);
  assert.ok(
    stat.isFile() && stat.size <= 128 * 1024,
    "The release plan must be a bounded regular file",
  );
  const plan = validatePlan(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file)),
    ),
  );
  for (const key of ["repository", "revision", "version"])
    if (expected[key] !== undefined)
      assert.equal(plan[key], expected[key], `Release plan ${key} mismatch`);
  if (expected.digest !== undefined) {
    assert.ok(
      typeof expected.digest === "string" &&
        expected.digest.length === 64 &&
        /^[0-9a-f]+$/.test(expected.digest),
      "Invalid release plan digest",
    );
    assert.equal(
      planDigest(plan),
      expected.digest,
      "Release plan digest mismatch",
    );
  }
  return plan;
}

export function releaseHistory(repository, run = command) {
  const pages = JSON.parse(
    run("gh", [
      "api",
      "--paginate",
      "--slurp",
      `repos/${repository}/releases?per_page=100`,
    ]),
  );
  assert.ok(
    Array.isArray(pages) && pages.every(Array.isArray),
    "Expected paginated GitHub releases",
  );
  return pages.flat();
}

export function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  // Commands may handle credentials. Never include raw output or environment in errors.
  if (result.error || result.status !== 0)
    throw new Error(`${name} failed (exit ${result.status ?? "unavailable"})`);
  return result.stdout.trim();
}

const sha256 = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const archiveName = (version, arch) =>
  `nexa-home_${version}_linux_${arch}.tar.gz`;

function inspectImage(image, arch, metadata, run) {
  const selected = JSON.parse(
    run("docker", ["image", "inspect", "--platform", `linux/${arch}`, image]),
  )[0];
  assert.equal(selected.Os, "linux");
  assert.equal(selected.Architecture, arch);
  assert.match(selected.Id, digestPattern);
  assert.equal(selected.Id.length, 71);
  assert.equal(selected.Config.User, "10001:10001");
  assert.deepEqual(selected.Config.Entrypoint, ["/nexa-home"]);
  const labels = selected.Config.Labels || {};
  assert.equal(labels["org.opencontainers.image.version"], metadata.version);
  assert.equal(labels["org.opencontainers.image.revision"], metadata.revision);
  assert.equal(labels["org.opencontainers.image.source"], metadata.source);
  return selected.Id;
}

function checkExecutable(file, arch) {
  const header = readFileSync(file).subarray(0, 20);
  assert.ok(
    header.length === 20 &&
      header.subarray(0, 6).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1])),
    "Release executables must be little-endian 64-bit ELF files",
  );
  assert.equal(
    header.readUInt16LE(18),
    arch === "amd64" ? 62 : 183,
    "Executable architecture must match its release archive",
  );
}

export function packageRelease({
  metadata,
  arch,
  directory = "release-artifacts",
  root = ".",
  qemu,
  run = command,
}) {
  assert.ok(architectures.includes(arch), "Unsupported release architecture");
  assert.equal(sourceVersion(root), metadata.version);
  const image = `nexa-home:ci-${arch}`;
  const imageId = inspectImage(image, arch, metadata, run);
  const output = resolve(directory, arch);
  mkdirSync(resolve(directory), { recursive: true });
  mkdirSync(output); // A rerun must not silently overwrite an existing local export.
  const executable = join(output, "nexa-home");
  let container = "";
  try {
    const created = run("docker", [
      "create",
      "--platform",
      `linux/${arch}`,
      "--network",
      "none",
      "--entrypoint",
      "/nexa-home",
      image,
      "version",
    ]);
    assert.match(
      created,
      /^[0-9a-f]{64}$/,
      "Expected the exact newly created container ID",
    );
    assert.equal(created.length, 64);
    container = created;
    run("docker", ["cp", `${container}:/nexa-home`, executable]);
  } finally {
    if (container) run("docker", ["rm", container]);
  }
  checkExecutable(executable, arch);
  if (qemu)
    assert.ok(isAbsolute(qemu), "The test emulator must be an absolute path");
  const version = spawnSync(
    qemu || executable,
    qemu ? [executable, "version"] : ["version"],
    { encoding: "utf8", timeout: 10_000 },
  );
  assert.ok(
    !version.error &&
      version.status === 0 &&
      `${version.stdout}${version.stderr}`.trim() ===
        `Nexa Home ${metadata.version}`,
    "The exported executable must report the release version",
  );
  const timestamp = run("git", [
    "show",
    "-s",
    "--format=%ct",
    metadata.revision,
  ]);
  assert.match(timestamp, /^\d+$/, "Invalid source timestamp");
  const archive = archiveName(metadata.version, arch);
  // The source archive includes only the executable and legally required texts.
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    copyFileSync(join(root, name), join(output, name));
  run("tar", [
    "--sort=name",
    `--mtime=@${timestamp}`,
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    join(output, archive),
    "-C",
    output,
    "nexa-home",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]);
  run("docker", [
    "image",
    "save",
    "--platform",
    `linux/${arch}`,
    "--output",
    join(output, "image.tar"),
    image,
  ]);
  const files = Object.fromEntries(
    ["nexa-home", archive, "image.tar"].map((name) => [
      name,
      sha256(join(output, name)),
    ]),
  );
  writeFileSync(
    join(output, "metadata.json"),
    JSON.stringify(
      {
        version: metadata.version,
        revision: metadata.revision,
        ...(metadata.planDigest ? { planDigest: metadata.planDigest } : {}),
        arch,
        imageId,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  // Only declared public release files are eligible for the artifact upload.
  return { output, archive, imageId };
}

export function verifyArtifact(directory, arch, metadata) {
  assert.ok(architectures.includes(arch));
  const archive = archiveName(metadata.version, arch);
  const expected = [
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "nexa-home",
    archive,
    "image.tar",
    "metadata.json",
  ].sort();
  assert.deepEqual(
    readdirSync(directory).sort(),
    expected,
    "The artifact must contain only declared release files",
  );
  for (const name of expected)
    assert.ok(
      lstatSync(join(directory, name)).isFile(),
      "Release files must not be symlinks or directories",
    );
  const record = JSON.parse(
    readFileSync(join(directory, "metadata.json"), "utf8"),
  );
  assert.deepEqual(
    Object.keys(record).sort(),
    [
      "arch",
      "files",
      "imageId",
      "revision",
      "version",
      ...(metadata.planDigest ? ["planDigest"] : []),
    ].sort(),
  );
  if (metadata.planDigest)
    assert.equal(
      record.planDigest,
      metadata.planDigest,
      "Artifact release plan mismatch",
    );
  assert.equal(record.version, metadata.version);
  assert.equal(record.revision, metadata.revision);
  assert.equal(record.arch, arch);
  assert.match(record.imageId, digestPattern);
  assert.equal(record.imageId.length, 71);
  assert.deepEqual(
    Object.keys(record.files).sort(),
    ["nexa-home", archive, "image.tar"].sort(),
  );
  for (const [name, digest] of Object.entries(record.files)) {
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.equal(
      sha256(join(directory, name)),
      digest,
      "Release artifact checksum mismatch",
    );
  }
  checkExecutable(join(directory, "nexa-home"), arch);
  return { ...record, archive };
}

export function shouldPromoteLatest(version, releases) {
  if (parseVersion(version).prerelease) return false;
  return !releases.some((release) => {
    if (
      release.draft ||
      release.prerelease ||
      !release.tag_name?.startsWith("v")
    )
      return false;
    try {
      return (
        !parseVersion(release.tag_name.slice(1)).prerelease &&
        compareVersions(release.tag_name.slice(1), version) >= 0
      );
    } catch {
      return false;
    }
  });
}

function requireDigest(value) {
  assert.match(value, digestPattern);
  assert.equal(value.length, 71);
  return value;
}

function indexPlatforms(index, expected) {
  assert.equal(index.schemaVersion, 2);
  assert.ok(
    Array.isArray(index.manifests),
    "A multi-platform image index is required",
  );
  const runtime = index.manifests.filter(
    (entry) => entry.platform?.os !== "unknown",
  );
  assert.deepEqual(
    runtime
      .map((entry) => `${entry.platform?.os}/${entry.platform?.architecture}`)
      .sort(),
    expected.map((arch) => `linux/${arch}`).sort(),
    "The index must contain exactly the verified Linux architectures",
  );
  for (const entry of index.manifests) {
    requireDigest(entry.digest);
    if (entry.platform?.os === "unknown") {
      assert.equal(entry.platform.architecture, "unknown");
      assert.equal(
        entry.annotations?.["vnd.docker.reference.type"],
        "attestation-manifest",
      );
    }
  }
  return Object.fromEntries(
    runtime.map((entry) => [entry.platform.architecture, entry.digest]),
  );
}

export function verifyRelease(directory, metadata) {
  assert.deepEqual(
    readdirSync(directory).sort(),
    architectures.map((arch) => `release-linux-${arch}`),
    "Only this run's two architecture artifacts may be published",
  );
  return Object.fromEntries(
    architectures.map((arch) => {
      const artifact = join(directory, `release-linux-${arch}`);
      assert.ok(
        lstatSync(artifact).isDirectory(),
        "Architecture artifacts must not be symlinks",
      );
      return [arch, verifyArtifact(artifact, arch, metadata)];
    }),
  );
}

function requireCurrentTag(metadata, run, objectSha) {
  let target = JSON.parse(
    run("gh", [
      "api",
      `repos/${metadata.repository}/git/ref/tags/${encodeURIComponent(metadata.tag)}`,
    ]),
  ).object;
  if (objectSha)
    assert.equal(
      target?.sha,
      objectSha,
      "The release tag object changed after verification",
    );
  for (let depth = 0; target?.type === "tag" && depth < 8; depth++) {
    assert.match(target.sha, /^[0-9a-f]{40}$/);
    assert.equal(target.sha.length, 40);
    target = JSON.parse(
      run("gh", ["api", `repos/${metadata.repository}/git/tags/${target.sha}`]),
    ).object;
  }
  assert.equal(
    target?.type,
    "commit",
    "The release tag must resolve to a commit",
  );
  assert.equal(
    target.sha,
    metadata.revision,
    "The release tag moved after verification",
  );
}

export function tagPlanMessage(plan) {
  const value = validatePlan(plan);
  assert.ok(value.version, "A tag needs a release version");
  return `Nexa Home ${value.version}\n\nnexa-release-plan:${planDigest(value)}\n${JSON.stringify(value)}\n`;
}

export function recoverTagPlan(message, expected = {}) {
  if (!message.includes("\nnexa-release-plan:")) return null;
  assert.ok(
    Buffer.byteLength(message) <= 128 * 1024,
    "Oversized tag plan receipt",
  );
  const match =
    /^Nexa Home ([^\n]+)\n\nnexa-release-plan:([0-9a-f]{64})\n([\s\S]+)$/.exec(
      message,
    );
  assert.ok(match, "Malformed tag plan receipt");
  const plan = validatePlan(JSON.parse(match[3]));
  assert.equal(plan.version, match[1], "Tag receipt version mismatch");
  assert.equal(planDigest(plan), match[2], "Tag receipt digest mismatch");
  for (const key of ["repository", "revision", "version"])
    if (expected[key] !== undefined)
      assert.equal(plan[key], expected[key], `Tag receipt ${key} mismatch`);
  return plan;
}

export function metadataForPlan(plan) {
  const value = validatePlan(plan);
  assert.ok(value.version, "The plan contains no new release");
  return {
    ...releaseMetadata({
      tag: `v${value.version}`,
      repository: value.repository,
      revision: value.revision,
    }),
    planDigest: planDigest(value),
  };
}

function requirePlanBaseline(plan, releases, run) {
  if (plan.base) {
    assert.ok(
      releases.some(
        (release) =>
          release.tag_name === plan.base.tag &&
          !release.draft &&
          !release.prerelease,
      ),
      "The published release baseline disappeared",
    );
    requireCurrentTag(
      {
        repository: plan.repository,
        tag: plan.base.tag,
        revision: plan.base.revision,
      },
      run,
    );
  }
  if (plan.mode === "auto") {
    const unchanged = releases.every((release) => {
      if (
        release.draft ||
        release.prerelease ||
        !release.tag_name?.startsWith("v")
      )
        return true;
      let parsed;
      try {
        parsed = parseVersion(release.tag_name.slice(1));
      } catch {
        return true;
      }
      return (
        parsed.prerelease ||
        (plan.base &&
          compareVersions(parsed.version, plan.base.tag.slice(1)) <= 0)
      );
    });
    assert.ok(
      unchanged,
      "Release baseline changed; rerun full planning and verification",
    );
  }
}

function ensurePlanTag(plan, metadata, run) {
  const matches = JSON.parse(
    run("gh", [
      "api",
      `repos/${metadata.repository}/git/matching-refs/tags/${encodeURIComponent(metadata.tag)}`,
    ]),
  );
  assert.ok(Array.isArray(matches), "Expected matching tag refs");
  const current = matches.filter(
    (entry) => entry.ref === `refs/tags/${metadata.tag}`,
  );
  assert.ok(current.length <= 1, "Ambiguous release tag");
  if (current.length) {
    const object = current[0].object;
    assert.ok(
      object?.sha?.length === 40 && /^[0-9a-f]+$/.test(object.sha),
      "Invalid tag object",
    );
    if (plan.mode === "auto") {
      assert.equal(
        object.type,
        "tag",
        "Only this pipeline's annotated automatic tag may be resumed",
      );
      const tag = JSON.parse(
        run("gh", [
          "api",
          `repos/${metadata.repository}/git/tags/${object.sha}`,
        ]),
      );
      const recovered = recoverTagPlan(tag.message || "", plan);
      assert.ok(
        recovered && planDigest(recovered) === planDigest(plan),
        "The existing tag belongs to another release plan",
      );
      assert.equal(tag.object?.type, "commit");
      assert.equal(tag.object.sha, metadata.revision);
    }
    return object.sha;
  }
  assert.equal(
    plan.mode,
    "auto",
    "Manual publication requires an existing version tag",
  );
  const created = JSON.parse(
    run(
      "gh",
      [
        "api",
        "--method",
        "POST",
        `repos/${metadata.repository}/git/tags`,
        "--input",
        "-",
      ],
      {
        input: JSON.stringify({
          tag: metadata.tag,
          message: tagPlanMessage(plan),
          object: metadata.revision,
          type: "commit",
        }),
      },
    ),
  );
  assert.ok(
    created.sha?.length === 40 && /^[0-9a-f]+$/.test(created.sha),
    "Invalid created tag object",
  );
  const ref = JSON.parse(
    run(
      "gh",
      [
        "api",
        "--method",
        "POST",
        `repos/${metadata.repository}/git/refs`,
        "--input",
        "-",
      ],
      {
        input: JSON.stringify({
          ref: `refs/tags/${metadata.tag}`,
          sha: created.sha,
        }),
      },
    ),
  );
  assert.equal(ref.ref, `refs/tags/${metadata.tag}`);
  assert.equal(ref.object?.sha, created.sha);
  return created.sha;
}

export function publishRelease({
  metadata,
  directory = "release-artifacts",
  plan,
  runId,
  attempt,
  run = command,
}) {
  for (const value of [runId, attempt])
    assert.ok(
      typeof value === "string" &&
        value.length <= 24 &&
        !/[^0-9]/.test(value) &&
        /^[1-9]\d*$/.test(value),
      "Invalid workflow run identity",
    );
  assert.equal(
    Boolean(plan),
    Boolean(metadata.planDigest),
    "Publication needs its exact release plan identity",
  );
  if (plan) {
    plan = validatePlan(plan);
    assert.deepEqual(
      metadata,
      metadataForPlan(plan),
      "Publication metadata must match the exact release plan",
    );
  }
  const records = verifyRelease(directory, metadata);
  const releases = releaseHistory(metadata.repository, run);
  const existing = releases.find(
    (release) => release.tag_name === metadata.tag,
  );
  const marker = `<!-- nexa-release:${metadata.revision} -->`;
  if (existing) {
    assert.equal(
      existing.draft,
      true,
      "A published release must never be overwritten",
    );
    assert.equal(
      existing.target_commitish,
      metadata.revision,
      "An existing draft must target this exact commit",
    );
    assert.ok(
      existing.body?.includes(marker),
      "Only this pipeline's own draft may be resumed",
    );
  }
  if (plan && existing)
    assert.ok(
      existing.body?.includes(`<!-- nexa-plan:${metadata.planDigest} -->`),
      "The existing draft belongs to another release plan",
    );
  if (plan) requirePlanBaseline(plan, releases, run);
  const tagObject = plan ? ensurePlanTag(plan, metadata, run) : undefined;
  requireCurrentTag(metadata, run, tagObject);
  const latest = shouldPromoteLatest(metadata.version, releases);
  const notesFile = join(directory, "release-notes.md");
  const body = plan
    ? `${marker}\n<!-- nexa-plan:${metadata.planDigest} -->\n\n${plan.notes.trim()}\n\nImage: ${metadata.image}:${metadata.version}\n\nArchives include the executable, LICENSE and third-party notices.\n`
    : "";
  if (plan) writeFileSync(notesFile, body);
  if (!existing) {
    run("gh", [
      "release",
      "create",
      metadata.tag,
      "--repo",
      metadata.repository,
      "--target",
      metadata.revision,
      "--verify-tag",
      "--draft",
      "--latest=false",
      "--title",
      `Nexa Home ${metadata.version}`,
      ...(plan
        ? ["--notes-file", notesFile]
        : [
            "--generate-notes",
            "--notes",
            `${marker}\n\nImage: ${metadata.image}:${metadata.version}\n\nArchives include the executable, LICENSE and third-party notices.`,
          ]),
      ...(metadata.prerelease ? ["--prerelease"] : []),
    ]);
  }
  const sources = [];
  const expected = {};
  for (const arch of architectures) {
    const artifact = join(directory, `release-linux-${arch}`);
    run("docker", ["image", "load", "--input", join(artifact, "image.tar")]);
    const image = `nexa-home:ci-${arch}`;
    // Image IDs differ between Docker storage backends. Load the checksummed
    // archive and inspect its metadata instead of running a platform child ID.
    inspectImage(image, arch, metadata, run);
    const staging = `${metadata.image}:build-${runId}-${attempt}-${arch}`;
    run("docker", ["image", "tag", image, staging]);
    run("docker", ["image", "push", staging], { timeout: 300_000 });
    const references = JSON.parse(
      run("docker", [
        "image",
        "inspect",
        "--platform",
        `linux/${arch}`,
        "--format",
        "{{json .RepoDigests}}",
        staging,
      ]),
    ).filter((value) => value.startsWith(`${metadata.image}@`));
    assert.equal(
      references.length,
      1,
      "The pushed architecture must have one immutable registry digest",
    );
    const digest = requireDigest(
      references[0].slice(metadata.image.length + 1),
    );
    const source = `${metadata.image}@${digest}`;
    const manifest = JSON.parse(
      run("docker", ["buildx", "imagetools", "inspect", "--raw", source]),
    );
    if (manifest.manifests)
      expected[arch] = indexPlatforms(manifest, [arch])[arch];
    else {
      assert.equal(manifest.schemaVersion, 2);
      requireDigest(manifest.config?.digest);
      assert.ok(Array.isArray(manifest.layers));
      expected[arch] = digest;
    }
    sources.push(source);
  }
  const published = join(directory, "published-image.json");
  const reference = `${metadata.image}:${metadata.version}`;
  run(
    "docker",
    [
      "buildx",
      "imagetools",
      "create",
      "--metadata-file",
      published,
      "--annotation",
      `index:org.opencontainers.image.version=${metadata.version}`,
      "--annotation",
      `index:org.opencontainers.image.revision=${metadata.revision}`,
      "--annotation",
      `index:org.opencontainers.image.source=${metadata.source}`,
      "--tag",
      reference,
      ...sources,
    ],
    { timeout: 300_000 },
  );
  const descriptor = JSON.parse(readFileSync(published, "utf8"))[
    "containerimage.descriptor"
  ];
  const digest = requireDigest(descriptor?.digest);
  const immutable = `${metadata.image}@${digest}`;
  const index = JSON.parse(
    run("docker", ["buildx", "imagetools", "inspect", "--raw", immutable]),
  );
  assert.deepEqual(
    indexPlatforms(index, architectures),
    expected,
    "The published index must reference the exact pushed and verified architecture digests",
  );
  assert.equal(
    index.mediaType,
    "application/vnd.oci.image.index.v1+json",
    "The published image must be an OCI index to preserve release annotations",
  );
  assert.equal(
    index.annotations?.["org.opencontainers.image.version"],
    metadata.version,
    "The published index version annotation must match the verified release",
  );
  assert.equal(
    index.annotations?.["org.opencontainers.image.revision"],
    metadata.revision,
    "The published index revision annotation must match the verified source",
  );
  assert.equal(
    index.annotations?.["org.opencontainers.image.source"],
    metadata.source,
    "The published index source annotation must match the verified repository",
  );
  const assets = [];
  for (const arch of architectures) {
    const file = join(
      directory,
      `release-linux-${arch}`,
      records[arch].archive,
    );
    const destination = join(directory, records[arch].archive);
    copyFileSync(file, destination);
    assets.push(destination);
  }
  const imageDigest = join(directory, "image-digest.txt");
  writeFileSync(imageDigest, `${immutable}\n`);
  assets.push(imageDigest);
  const checksums = join(directory, "SHA256SUMS");
  writeFileSync(
    checksums,
    assets
      .map((file) => `${sha256(file)}  ${file.split(/[\\/]/).at(-1)}\n`)
      .join(""),
  );
  assets.push(checksums);
  run(
    "gh",
    [
      "release",
      "upload",
      metadata.tag,
      "--repo",
      metadata.repository,
      "--clobber",
      ...assets,
    ],
    { timeout: 300_000 },
  );
  requireCurrentTag(metadata, run, tagObject);
  if (plan)
    requirePlanBaseline(plan, releaseHistory(metadata.repository, run), run);
  if (latest) {
    const promoted = join(directory, "latest-image.json");
    run(
      "docker",
      [
        "buildx",
        "imagetools",
        "create",
        "--metadata-file",
        promoted,
        "--tag",
        `${metadata.image}:latest`,
        immutable,
      ],
      { timeout: 300_000 },
    );
    assert.equal(
      JSON.parse(readFileSync(promoted, "utf8"))["containerimage.descriptor"]
        ?.digest,
      digest,
      "Latest must be an exact copy of the verified version index",
    );
  }
  if (plan) writeFileSync(notesFile, `${body}\nImage digest: ${immutable}\n`);
  run("gh", [
    "release",
    "edit",
    metadata.tag,
    "--repo",
    metadata.repository,
    ...(plan ? ["--notes-file", notesFile] : []),
    "--draft=false",
    `--prerelease=${metadata.prerelease}`,
    `--latest=${latest}`,
  ]);
  return { reference: immutable, latest };
}

export function workflowRevision() {
  const requested = process.env.GITHUB_SHA;
  assert.ok(
    typeof requested === "string" &&
      requested.length === 40 &&
      /^[0-9a-f]+$/.test(requested),
    "A full workflow source SHA is required",
  );
  const revision = command("git", ["rev-parse", "HEAD"]);
  assert.equal(
    command("git", ["rev-parse", `${requested}^{commit}`]),
    revision,
    "Checkout must match the triggering source commit",
  );
  return revision;
}

function workflowPlan() {
  const revision = workflowRevision();
  releaseMetadata({
    tag: "v1.0.0",
    repository: process.env.GITHUB_REPOSITORY,
    revision,
  });
  const plan = readPlan("release-plan/plan.json", {
    repository: process.env.GITHUB_REPOSITORY,
    revision,
    digest: process.env.NEXA_RELEASE_PLAN_DIGEST,
  });
  if (process.env.GITHUB_REF_TYPE === "tag")
    assert.equal(
      `v${plan.version}`,
      process.env.GITHUB_REF_NAME,
      "The plan must match the selected version tag",
    );
  else {
    assert.equal(process.env.GITHUB_REF_TYPE, "branch");
    assert.equal(
      process.env.GITHUB_REF_NAME,
      "master",
      "Only master may publish an automatic release",
    );
    assert.equal(plan.mode, "auto");
  }
  return plan;
}

function metadataFromEnvironment() {
  sourceVersion();
  if (process.env.NEXA_RELEASE_PLAN_DIGEST)
    return metadataForPlan(workflowPlan());
  assert.equal(
    process.env.GITHUB_REF_TYPE,
    "tag",
    "Publishing requires a verified release plan or explicit version tag",
  );
  return releaseMetadata({
    tag: process.env.GITHUB_REF_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    revision: workflowRevision(),
  });
}

function main() {
  const [operation, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, "Unexpected release arguments");
  if (operation === "version") {
    console.log(buildVersion());
    return;
  }
  if (operation === "stamp") {
    assert.ok(process.env.NEXA_BUILD_VERSION, "NEXA_BUILD_VERSION is required");
    stampVersion(process.env.NEXA_BUILD_VERSION);
    console.log(
      `Stamped ${process.env.NEXA_BUILD_VERSION} in the local build checkout only.`,
    );
    return;
  }
  if (operation === "publish") {
    assert.equal(
      process.env.GITHUB_ACTIONS,
      "true",
      "Publication is allowed only in the release workflow",
    );
    assert.ok(
      ["push", "workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME),
      "Only a tag push, master push or explicit release dispatch may publish",
    );
    assert.ok(
      process.env.NEXA_RELEASE_PLAN_DIGEST,
      "A verified release plan is required",
    );
    if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
      assert.equal(
        process.env.NEXA_RELEASE_MODE,
        "resume",
        "Preview mode cannot publish",
      );
      assert.equal(
        process.env.GITHUB_REF_TYPE,
        "tag",
        "Resume must select the exact existing version tag",
      );
    }
    assert.ok(process.env.GH_TOKEN, "A job-scoped GitHub token is required");
  }
  const metadata = metadataFromEnvironment();
  if (operation === "metadata") {
    assert.ok(process.env.GITHUB_OUTPUT, "GITHUB_OUTPUT is required");
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(metadata)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
  } else if (operation === "package") {
    const arch = process.env.NEXA_TEST_PLATFORM?.replace(/^linux\//, "");
    const result = packageRelease({
      metadata,
      arch,
      qemu: process.env.NEXA_TEST_QEMU,
    });
    console.log(`Prepared ${result.archive}`);
  } else if (operation === "verify") {
    verifyRelease("release-artifacts", metadata);
    console.log("Both release artifacts match the version and source commit.");
  } else if (operation === "publish") {
    const result = publishRelease({
      metadata,
      plan: workflowPlan(),
      runId: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
    });
    console.log(`Published ${metadata.tag}: ${result.reference}`);
  } else {
    throw new Error(
      "Use release.mjs version, metadata, package, verify or publish",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
