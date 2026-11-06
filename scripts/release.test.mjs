import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
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
import {
  compareVersions,
  packageRelease,
  parseVersion,
  publishRelease,
  releaseMetadata,
  shouldPromoteLatest,
  sourceVersion,
  verifyArtifact,
  verifyRelease,
} from "./release.mjs";

const revision = "a".repeat(40);
const imageId = `sha256:${"b".repeat(64)}`;
const containerId = "c".repeat(64);
const arch = process.arch === "arm64" ? "arm64" : "amd64";
const directories = [];
const temporary = () => {
  const directory = mkdtempSync(join(tmpdir(), "nexa-release-test-"));
  directories.push(directory);
  return directory;
};
after(() => {
  for (const directory of directories)
    rmSync(directory, { recursive: true, force: true });
});

function fixture(version = "1.0.0") {
  const root = temporary();
  mkdirSync(join(root, "apps/web"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version }));
  writeFileSync(
    join(root, "apps/web/package.json"),
    JSON.stringify({ version }),
  );
  writeFileSync(
    join(root, "package-lock.json"),
    JSON.stringify({
      version,
      packages: { "": { version }, "apps/web": { version } },
    }),
  );
  writeFileSync(
    join(root, "LICENSE"),
    "Synthetic license text for release fixture.\n",
  );
  writeFileSync(
    join(root, "THIRD_PARTY_NOTICES.md"),
    "Synthetic retained third-party notices.\n",
  );
  const metadata = releaseMetadata({
    tag: `v${version}`,
    repository: "Owner/Nexa-Home",
    revision,
    root,
  });
  return { root, metadata, directory: join(root, "artifacts") };
}

let executable;
function versionExecutable() {
  if (executable) return executable;
  const directory = temporary();
  const source = join(directory, "main.go");
  executable = join(directory, "version-fixture");
  writeFileSync(
    source,
    'package main\nimport ("fmt"; "os")\nfunc main() { fmt.Fprintln(os.Stderr, "Nexa Home 1.0.0") }\n',
  );
  const built = spawnSync(
    "go",
    ["build", "-trimpath", "-o", executable, source],
    { encoding: "utf8", env: { ...process.env, CGO_ENABLED: "0" } },
  );
  assert.equal(
    built.status,
    0,
    "Compile the isolated native ELF version fixture",
  );
  return executable;
}

function tools(metadata, changes = {}) {
  const calls = [];
  const run = (name, args) => {
    calls.push([name, ...args]);
    if (name === "git") return "1793836800";
    if (name === "tar") {
      const result = spawnSync(name, args, { encoding: "utf8" });
      assert.equal(result.status, 0, "Create the real fixture archive");
      return result.stdout.trim();
    }
    assert.equal(
      name,
      "docker",
      "Unit tests must never invoke publishing tools",
    );
    if (args[0] === "image" && args[1] === "inspect")
      return JSON.stringify([
        {
          Os: "linux",
          Architecture: arch,
          Id: imageId,
          Config: {
            User: "10001:10001",
            Entrypoint: ["/nexa-home"],
            Labels: {
              "org.opencontainers.image.version": metadata.version,
              "org.opencontainers.image.revision": metadata.revision,
              "org.opencontainers.image.source": metadata.source,
              ...changes.labels,
            },
          },
        },
      ]);
    if (args[0] === "create") return changes.containerId || containerId;
    if (args[0] === "cp") {
      if (changes.copyFailure) throw new Error("Synthetic copy failure");
      copyFileSync(versionExecutable(), args[2]);
      chmodSync(args[2], 0o555);
      return "";
    }
    if (args[0] === "rm") return "";
    if (args[0] === "image" && args[1] === "save") {
      writeFileSync(
        args[args.indexOf("--output") + 1],
        "Synthetic immutable OCI archive bytes",
      );
      return "";
    }
    assert.fail("Unexpected Docker command in fixture");
  };
  return { run, calls };
}

for (const version of [
  "0.0.0",
  "1.0.0",
  "12.3.456",
  "1.2.3-rc.1",
  "1.2.3-alpha-beta",
  "9007199254740993.0.0",
])
  test(`accepts release version ${version}`, () =>
    assert.equal(parseVersion(version).version, version));
for (const version of [
  "v1.0.0",
  "1.0",
  "01.0.0",
  "1.01.0",
  "1.0.01",
  "1.0.0-01",
  "1.0.0-alpha.01",
  "1.0.0+build",
  "1.0.0-",
  "1.0.0-a..b",
  "1.0.0\n",
  "1.0.0\r",
  "1.0.0;whoami",
  "1.0.0/../../x",
  "1.0.0-$(id)",
  "1.0.0-é",
  "1.0.0-" + "x".repeat(128),
  "",
])
  test(`rejects unsafe or unsupported version ${JSON.stringify(version)}`, () =>
    assert.throws(() => parseVersion(version)));

test("orders SemVer prereleases and large numeric components without floating-point loss", () => {
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
    "1.0.1",
    "1.1.0",
    "2.0.0",
    "9007199254740992.0.0",
    "9007199254740993.0.0",
  ];
  for (let index = 1; index < ordered.length; index++) {
    assert.equal(compareVersions(ordered[index - 1], ordered[index]), -1);
    assert.equal(compareVersions(ordered[index], ordered[index - 1]), 1);
  }
  assert.equal(compareVersions("1.0.0-rc.1", "1.0.0-rc.1"), 0);
});

test("rejects drift across root, workspace and locked versions", () => {
  for (const file of ["apps/web/package.json", "package-lock.json"]) {
    const { root } = fixture();
    const value = JSON.parse(readFileSync(join(root, file), "utf8"));
    value.version = "1.0.1";
    writeFileSync(join(root, file), JSON.stringify(value));
    assert.throws(() => sourceVersion(root));
  }
  for (const key of ["", "apps/web"]) {
    const { root } = fixture();
    const lock = JSON.parse(
      readFileSync(join(root, "package-lock.json"), "utf8"),
    );
    lock.packages[key].version = "1.0.1";
    writeFileSync(join(root, "package-lock.json"), JSON.stringify(lock));
    assert.throws(() => sourceVersion(root));
  }
});

test("derives normalized GHCR metadata from a valid release tag and full commit", () => {
  const { root, metadata } = fixture();
  assert.equal(metadata.image, "ghcr.io/owner/nexa-home");
  assert.equal(metadata.source, "https://github.com/Owner/Nexa-Home");
  assert.equal(metadata.prerelease, false);
  assert.equal(fixture("1.0.0-rc.1").metadata.prerelease, true);
  assert.equal(
    releaseMetadata({ tag: "v1.0.1", repository: "owner/repo", revision })
      .version,
    "1.0.1",
  );
  for (const values of [
    { tag: "1.0.0" },
    { tag: "v1.0.0\n" },
    { revision: "abcd" },
    { revision: revision + "\n" },
    { repository: "owner/repo\nname" },
    { repository: "owner/repo/extra" },
    { repository: "owner/repo:latest" },
    { repository: "owner/../repo" },
  ])
    assert.throws(() =>
      releaseMetadata({
        tag: "v1.0.0",
        repository: "owner/repo",
        revision,
        root,
        ...values,
      }),
    );
});

test("packages the exact exported executable, licenses and image without arbitrary workspace data", () => {
  const input = fixture();
  writeFileSync(
    join(input.root, ".env"),
    "A synthetic secret that must not enter an archive\n",
  );
  const { run, calls } = tools(input.metadata);
  const result = packageRelease({ ...input, arch, run });
  const record = verifyArtifact(result.output, arch, input.metadata);
  assert.equal(record.imageId, imageId);
  const contents = spawnSync(
    "tar",
    ["-tzf", join(result.output, result.archive)],
    { encoding: "utf8" },
  );
  assert.equal(contents.status, 0);
  assert.deepEqual(contents.stdout.trim().split("\n").sort(), [
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "nexa-home",
  ]);
  assert.equal(calls.filter((call) => call[1] === "rm").length, 1);
  assert.deepEqual(
    calls.find((call) => call[1] === "rm"),
    ["docker", "rm", containerId],
  );
  assert.throws(() => packageRelease({ ...input, arch, run }), /EEXIST/);
});

test("refuses mismatched image labels before creating an export or container", () => {
  for (const labels of [
    { "org.opencontainers.image.version": "9.0.0" },
    { "org.opencontainers.image.revision": "d".repeat(40) },
    { "org.opencontainers.image.source": "https://example.invalid/other" },
  ]) {
    const input = fixture();
    const { run, calls } = tools(input.metadata, { labels });
    assert.throws(() => packageRelease({ ...input, arch, run }));
    assert.equal(calls.filter((call) => call[1] === "create").length, 0);
  }
});

test("cleans up only the exact created container when extraction fails", () => {
  const input = fixture();
  const { run, calls } = tools(input.metadata, { copyFailure: true });
  assert.throws(
    () => packageRelease({ ...input, arch, run }),
    /Synthetic copy failure/,
  );
  assert.deepEqual(
    calls.filter((call) => call[1] === "rm"),
    [["docker", "rm", containerId]],
  );
  const invalid = tools(input.metadata, {
    containerId: "some-existing-container",
  });
  assert.throws(() =>
    packageRelease({
      ...input,
      directory: join(input.root, "other"),
      arch,
      run: invalid.run,
    }),
  );
  assert.equal(invalid.calls.filter((call) => call[1] === "rm").length, 0);
});

test("artifact verification rejects tampering, extra files, symlinks and foreign source metadata", () => {
  for (const change of [
    "checksum",
    "extra",
    "symlink",
    "revision",
    "arch",
    "metadata-path",
  ]) {
    const input = fixture();
    const { run } = tools(input.metadata);
    const { output } = packageRelease({ ...input, arch, run });
    const metadataFile = join(output, "metadata.json");
    const record = JSON.parse(readFileSync(metadataFile, "utf8"));
    if (change === "checksum")
      writeFileSync(join(output, "image.tar"), "tampered");
    if (change === "extra")
      writeFileSync(join(output, ".env"), "not a release asset");
    if (change === "symlink") {
      rmSync(join(output, "image.tar"));
      symlinkSync(join(input.root, "LICENSE"), join(output, "image.tar"));
    }
    if (change === "revision") record.revision = "e".repeat(40);
    if (change === "arch") record.arch = "other";
    if (change === "metadata-path")
      record.files["../package.json"] = "0".repeat(64);
    writeFileSync(metadataFile, JSON.stringify(record));
    assert.throws(() => verifyArtifact(output, arch, input.metadata), change);
  }
});

test("the version CLI is offline and rejects unexpected arguments", () => {
  const { root } = fixture();
  const script = resolve("scripts/release.mjs");
  const result = spawnSync(process.execPath, [script, "version"], {
    encoding: "utf8",
    cwd: root,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "1.0.0");
  const invalid = spawnSync(process.execPath, [script, "version", "extra"], {
    encoding: "utf8",
    cwd: root,
  });
  assert.notEqual(invalid.status, 0);
});

function publisherFixture(version = "1.0.0") {
  const input = fixture(version);
  mkdirSync(input.directory);
  for (const platform of ["amd64", "arm64"]) {
    const output = join(input.directory, `release-linux-${platform}`);
    mkdirSync(output);
    const executable = Buffer.alloc(64);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(executable);
    executable.writeUInt16LE(platform === "amd64" ? 62 : 183, 18);
    const archive = `nexa-home_${version}_linux_${platform}.tar.gz`;
    writeFileSync(join(output, "nexa-home"), executable);
    writeFileSync(
      join(output, archive),
      `Synthetic release archive ${platform}`,
    );
    writeFileSync(join(output, "image.tar"), `Synthetic OCI image ${platform}`);
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
      copyFileSync(join(input.root, file), join(output, file));
    const files = Object.fromEntries(
      ["nexa-home", archive, "image.tar"].map((file) => [
        file,
        createHash("sha256")
          .update(readFileSync(join(output, file)))
          .digest("hex"),
      ]),
    );
    writeFileSync(
      join(output, "metadata.json"),
      JSON.stringify({ version, revision, arch: platform, imageId, files }),
    );
  }
  return input;
}

function publishingTools(input, options = {}) {
  const calls = [];
  let tagChecks = 0;
  const nativeDigests = {
    amd64: `sha256:${"1".repeat(64)}`,
    arm64: `sha256:${"2".repeat(64)}`,
  };
  const pushedDigests = options.nested
    ? { amd64: `sha256:${"4".repeat(64)}`, arm64: `sha256:${"5".repeat(64)}` }
    : nativeDigests;
  const indexDigest = `sha256:${"3".repeat(64)}`;
  const annotations = {
    "org.opencontainers.image.version": input.metadata.version,
    "org.opencontainers.image.revision": input.metadata.revision,
    "org.opencontainers.image.source": input.metadata.source,
  };
  const index = {
    schemaVersion: 2,
    annotations,
    manifests: ["amd64", "arm64"].map((platform) => ({
      digest: nativeDigests[platform],
      platform: { os: "linux", architecture: platform },
    })),
  };
  if (options.wrongIndex)
    index.manifests[1].digest = `sha256:${"e".repeat(64)}`;
  const run = (name, args) => {
    calls.push([name, ...args]);
    if (name === "gh") {
      if (args[0] === "api") {
        if (options.apiFailure) throw new Error("Synthetic API failure");
        if (args.at(-1).includes("/git/ref/tags/")) {
          tagChecks++;
          const sha =
            options.movedTag || (options.moveDuringPublish && tagChecks > 1)
              ? "e".repeat(40)
              : revision;
          return JSON.stringify({
            object: options.annotated
              ? { type: "tag", sha: "d".repeat(40) }
              : { type: "commit", sha },
          });
        }
        if (args.at(-1).includes("/git/tags/"))
          return JSON.stringify({ object: { type: "commit", sha: revision } });
        return JSON.stringify([options.releases || []]);
      }
      assert.equal(args[0], "release");
      assert.ok(["create", "upload", "edit"].includes(args[1]));
      return "";
    }
    assert.equal(
      name,
      "docker",
      "No real network publication or rebuild is allowed in this fixture",
    );
    if (args[0] === "image") {
      if (args[1] === "load" || args[1] === "tag") return "";
      if (args[1] === "push") {
        if (options.pushFailure) throw new Error("Synthetic registry failure");
        return "";
      }
      assert.equal(args[1], "inspect");
      const platform = args[args.indexOf("--platform") + 1].slice(
        "linux/".length,
      );
      if (args.includes("--format"))
        return JSON.stringify([
          `${input.metadata.image}@${pushedDigests[platform]}`,
        ]);
      return JSON.stringify([
        {
          Os: "linux",
          Architecture: platform,
          Id: `sha256:${"f".repeat(64)}`,
          Config: {
            User: "10001:10001",
            Entrypoint: ["/nexa-home"],
            Labels: annotations,
          },
        },
      ]);
    }
    assert.deepEqual(args.slice(0, 2), ["buildx", "imagetools"]);
    if (args[2] === "create") {
      const latest = args.includes(`${input.metadata.image}:latest`);
      writeFileSync(
        args[args.indexOf("--metadata-file") + 1],
        JSON.stringify({
          "containerimage.descriptor": {
            digest:
              latest && options.wrongLatest
                ? `sha256:${"9".repeat(64)}`
                : indexDigest,
          },
        }),
      );
      return "";
    }
    assert.equal(args[2], "inspect");
    const reference = args.at(-1);
    if (reference === `${input.metadata.image}@${indexDigest}`)
      return JSON.stringify(index);
    const platform = Object.keys(pushedDigests).find(
      (platform) =>
        reference === `${input.metadata.image}@${pushedDigests[platform]}`,
    );
    assert.ok(
      platform,
      "Only the just-pushed immutable image may be inspected",
    );
    return JSON.stringify(
      options.nested
        ? {
            schemaVersion: 2,
            manifests: [
              {
                digest: nativeDigests[platform],
                platform: { os: "linux", architecture: platform },
              },
              {
                digest: `sha256:${"6".repeat(64)}`,
                platform: { os: "unknown", architecture: "unknown" },
                annotations: {
                  "vnd.docker.reference.type": "attestation-manifest",
                },
              },
            ],
          }
        : { schemaVersion: 2, config: { digest: imageId }, layers: [] },
    );
  };
  return { run, calls, nativeDigests, indexDigest };
}

const publish = (input, tools) =>
  publishRelease({
    metadata: input.metadata,
    directory: input.directory,
    runId: "123",
    attempt: "1",
    run: tools.run,
  });
const releaseEdits = (calls) =>
  calls.filter(
    (call) => call[0] === "gh" && call[1] === "release" && call[2] === "edit",
  );
const latestCreates = (calls) =>
  calls.filter(
    (call) =>
      call[0] === "docker" &&
      call[1] === "buildx" &&
      call.includes("ghcr.io/owner/nexa-home:latest"),
  );

test("latest promotion ignores drafts and prereleases but never rolls back a newer stable version", () => {
  assert.equal(shouldPromoteLatest("1.0.0", []), true);
  assert.equal(
    shouldPromoteLatest("1.0.1", [
      { tag_name: "v1.0.0", draft: false, prerelease: false },
    ]),
    true,
  );
  assert.equal(
    shouldPromoteLatest("1.0.0", [
      { tag_name: "v1.0.1", draft: false, prerelease: false },
    ]),
    false,
  );
  assert.equal(
    shouldPromoteLatest("1.0.0", [
      { tag_name: "v1.0.0", draft: false, prerelease: false },
    ]),
    false,
  );
  assert.equal(shouldPromoteLatest("1.1.0-rc.1", []), false);
  assert.equal(
    shouldPromoteLatest("1.0.0", [
      { tag_name: "v2.0.0", draft: true },
      { tag_name: "v2.0.0-rc.1", prerelease: true },
      { tag_name: "nightly" },
      { tag_name: "vnot-semver" },
    ]),
    true,
  );
});

test("publishing reuses the two tested image archives and verifies immutable digests before exposing the release", () => {
  const input = publisherFixture();
  const tools = publishingTools(input);
  const result = publish(input, tools);
  assert.equal(result.latest, true);
  assert.equal(
    result.reference,
    `${input.metadata.image}@${tools.indexDigest}`,
  );
  const create = tools.calls.find(
    (call) => call[0] === "gh" && call[2] === "create",
  );
  assert.ok(
    create.includes("--draft") &&
      create.includes("--verify-tag") &&
      create.includes(revision),
  );
  assert.equal(
    tools.calls.filter((call) => call[0] === "docker" && call[2] === "push")
      .length,
    2,
  );
  assert.equal(
    tools.calls.filter((call) => call[0] === "docker" && call[2] === "load")
      .length,
    2,
  );
  assert.equal(
    tools.calls.some(
      (call) =>
        call[0] === "docker" &&
        (call[1] === "build" || call[2] === "build" || call[1] === "run"),
    ),
    false,
  );
  const upload = tools.calls.find(
    (call) => call[0] === "gh" && call[2] === "upload",
  );
  const assets = upload.slice(upload.indexOf("--clobber") + 1);
  assert.equal(assets.length, 4);
  assert.ok(
    assets.every((file) =>
      /(?:\.tar\.gz|SHA256SUMS|image-digest\.txt)$/.test(file),
    ),
  );
  assert.equal(latestCreates(tools.calls).length, 1);
  assert.ok(releaseEdits(tools.calls)[0].includes("--latest=true"));
  assert.equal(
    tools.calls.at(-1)[2],
    "edit",
    "The draft becomes public only after image verification and uploads",
  );
  const checksums = readFileSync(join(input.directory, "SHA256SUMS"), "utf8")
    .trim()
    .split("\n");
  assert.equal(checksums.length, 3);
  for (const line of checksums) {
    const [digest, file] = line.split("  ");
    assert.equal(
      createHash("sha256")
        .update(readFileSync(join(input.directory, file)))
        .digest("hex"),
      digest,
    );
  }
});

test("annotated tags are resolved and checked again immediately before publication", () => {
  const input = publisherFixture();
  const tools = publishingTools(input, { annotated: true });
  publish(input, tools);
  assert.equal(
    tools.calls.filter(
      (call) => call[0] === "gh" && call.at(-1).includes("/git/ref/tags/"),
    ).length,
    2,
  );
  assert.equal(
    tools.calls.filter(
      (call) => call[0] === "gh" && call.at(-1).includes("/git/tags/"),
    ).length,
    2,
  );
});

test("a tag moved before or during image publication never becomes a public release or latest", () => {
  for (const options of [{ movedTag: true }, { moveDuringPublish: true }]) {
    const input = publisherFixture();
    const tools = publishingTools(input, options);
    assert.throws(() => publish(input, tools), /tag moved/);
    assert.equal(releaseEdits(tools.calls).length, 0);
    assert.equal(latestCreates(tools.calls).length, 0);
  }
});

test("native OCI indexes with BuildKit attestations are merged without changing runtime digests", () => {
  const input = publisherFixture();
  const tools = publishingTools(input, { nested: true });
  assert.equal(publish(input, tools).latest, true);
});

test("prereleases and older stable backports never move Docker or GitHub latest", () => {
  for (const [version, releases] of [
    ["1.1.0-rc.1", []],
    ["1.0.0", [{ tag_name: "v1.1.0", draft: false, prerelease: false }]],
  ]) {
    const input = publisherFixture(version);
    const tools = publishingTools(input, { releases });
    assert.equal(publish(input, tools).latest, false);
    assert.equal(latestCreates(tools.calls).length, 0);
    assert.ok(releaseEdits(tools.calls)[0].includes("--latest=false"));
    assert.ok(
      releaseEdits(tools.calls)[0].includes(
        `--prerelease=${version.includes("-")}`,
      ),
    );
  }
});

test("only an unpublished pipeline-owned draft for the exact same commit can be resumed", () => {
  const input = publisherFixture();
  const tools = publishingTools(input, {
    releases: [
      {
        tag_name: "v1.0.0",
        draft: true,
        target_commitish: revision,
        body: `<!-- nexa-release:${revision} -->`,
      },
    ],
  });
  publish(input, tools);
  assert.equal(
    tools.calls.some((call) => call[0] === "gh" && call[2] === "create"),
    false,
  );
  assert.equal(releaseEdits(tools.calls).length, 1);
  for (const release of [
    {
      draft: false,
      target_commitish: revision,
      body: `<!-- nexa-release:${revision} -->`,
    },
    {
      draft: true,
      target_commitish: "d".repeat(40),
      body: `<!-- nexa-release:${revision} -->`,
    },
    {
      draft: true,
      target_commitish: revision,
      body: "Manually maintained draft",
    },
  ]) {
    const other = publisherFixture();
    const tools = publishingTools(other, {
      releases: [{ tag_name: "v1.0.0", ...release }],
    });
    assert.throws(() => publish(other, tools));
    assert.equal(
      tools.calls.some((call) => call[0] === "docker"),
      false,
    );
  }
});

test("tampered, incomplete, linked or foreign artifacts fail before any publishing command", () => {
  for (const change of ["missing", "tampered", "extra", "linked"]) {
    const input = publisherFixture();
    if (change === "missing")
      rmSync(join(input.directory, "release-linux-arm64"), { recursive: true });
    if (change === "tampered")
      writeFileSync(
        join(input.directory, "release-linux-amd64/image.tar"),
        "modified",
      );
    if (change === "extra")
      writeFileSync(join(input.directory, ".env"), "not a release artifact");
    if (change === "linked") {
      rmSync(join(input.directory, "release-linux-arm64"), { recursive: true });
      symlinkSync(
        join(input.directory, "release-linux-amd64"),
        join(input.directory, "release-linux-arm64"),
      );
    }
    const tools = publishingTools(input);
    assert.throws(() => publish(input, tools));
    assert.equal(tools.calls.length, 0);
  }
});

test("API, registry and index failures leave the GitHub release unpublished", () => {
  for (const options of [
    { apiFailure: true },
    { pushFailure: true },
    { wrongIndex: true },
    { wrongLatest: true },
  ]) {
    const input = publisherFixture();
    const tools = publishingTools(input, options);
    assert.throws(() => publish(input, tools));
    assert.equal(releaseEdits(tools.calls).length, 0);
    if (options.wrongIndex)
      assert.equal(
        tools.calls.some((call) => call[0] === "gh" && call[2] === "upload"),
        false,
      );
  }
});

test("invalid run identities cannot become registry tags", () => {
  for (const runId of [
    "1\n",
    "0",
    "../x",
    "123;id",
    "1".repeat(25),
    undefined,
  ]) {
    const input = publisherFixture();
    const tools = publishingTools(input);
    assert.throws(() =>
      publishRelease({
        metadata: input.metadata,
        directory: input.directory,
        runId,
        attempt: "1",
        run: tools.run,
      }),
    );
    assert.equal(tools.calls.length, 0);
  }
});

test("metadata resolves lightweight and annotated source references to the checked-out commit", () => {
  const script = resolve("scripts/release.mjs");
  for (const annotated of [false, true]) {
    const { root } = fixture();
    const git = (args) => {
      const result = spawnSync(
        "git",
        [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "tag.gpgsign=false",
          "-c",
          "user.name=Nexa Release Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          ...args,
        ],
        { cwd: root, encoding: "utf8" },
      );
      assert.equal(result.status, 0, "Prepare only the isolated Git fixture");
      return result.stdout.trim();
    };
    git(["init", "--initial-branch=fixture"]);
    git(["add", "."]);
    git(["commit", "-m", "test: create release fixture"]);
    const commit = git(["rev-parse", "HEAD"]);
    git(
      annotated
        ? ["tag", "-a", "v1.0.0", "-m", "Release fixture"]
        : ["tag", "v1.0.0"],
    );
    const reference = git(["rev-parse", "v1.0.0"]);
    const output = join(root, "workflow-output");
    const env = {
      ...process.env,
      GITHUB_REF_TYPE: "tag",
      GITHUB_REF_NAME: "v1.0.0",
      GITHUB_REPOSITORY: "Owner/Nexa-Home",
      GITHUB_SHA: reference,
      GITHUB_OUTPUT: output,
    };
    const result = spawnSync(process.execPath, [script, "metadata"], {
      cwd: root,
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 0);
    const values = Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("=")),
    );
    assert.equal(values.revision, commit);
    assert.equal(values.version, "1.0.0");
    assert.equal(values.image, "ghcr.io/owner/nexa-home");
    writeFileSync(join(root, "different-source"), "Another source commit");
    git(["add", "different-source"]);
    git(["commit", "-m", "test: change isolated source fixture"]);
    const mismatch = spawnSync(process.execPath, [script, "metadata"], {
      cwd: root,
      encoding: "utf8",
      env,
    });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /Checkout must match/);
  }
});

test("the publisher CLI cannot run accidentally outside a tag-release workflow", () => {
  const { root } = fixture();
  for (const values of [
    { GITHUB_ACTIONS: "false", GITHUB_EVENT_NAME: "push" },
    { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request" },
  ]) {
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/release.mjs"), "publish"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REF_TYPE: "tag",
          GITHUB_REF_NAME: "v1.0.0",
          GITHUB_REPOSITORY: "Owner/Nexa-Home",
          GITHUB_SHA: revision,
          GH_TOKEN: "synthetic-not-a-live-token",
          ...values,
        },
      },
    );
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Publication is allowed only|Only a tag push/);
  }
});
