import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  releaseMetadata,
  sourceVersion,
  verifyArtifact,
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

test("derives normalized GHCR metadata only from a matching tag and a full commit", () => {
  const { root, metadata } = fixture();
  assert.equal(metadata.image, "ghcr.io/owner/nexa-home");
  assert.equal(metadata.source, "https://github.com/Owner/Nexa-Home");
  assert.equal(metadata.prerelease, false);
  assert.equal(fixture("1.0.0-rc.1").metadata.prerelease, true);
  for (const values of [
    { tag: "v1.0.1" },
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
