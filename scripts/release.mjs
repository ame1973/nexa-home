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

export function releaseMetadata({ tag, repository, revision, root = "." }) {
  assert.ok(
    typeof tag === "string" && tag.startsWith("v"),
    "Release tags must start with v",
  );
  const parsed = parseVersion(tag.slice(1));
  assert.equal(
    sourceVersion(root),
    parsed.version,
    "The tag and package versions must match",
  );
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

function command(name, args, options = {}) {
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
  assert.deepEqual(Object.keys(record).sort(), [
    "arch",
    "files",
    "imageId",
    "revision",
    "version",
  ]);
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

function metadataFromEnvironment() {
  assert.equal(
    process.env.GITHUB_REF_TYPE,
    "tag",
    "Publishing requires an explicit version tag",
  );
  return releaseMetadata({
    tag: process.env.GITHUB_REF_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    revision: process.env.GITHUB_SHA,
  });
}

function main() {
  const [operation, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, "Unexpected release arguments");
  if (operation === "version") {
    console.log(sourceVersion());
    return;
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
  } else {
    throw new Error("Use release.mjs version, metadata or package");
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
