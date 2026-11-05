import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";

const verify = YAML.parse(readFileSync(".github/workflows/ci.yaml", "utf8"));
const release = YAML.parse(
  readFileSync(".github/workflows/release.yaml", "utf8"),
);
const actions = {
  "actions/checkout": "d23441a48e516b6c34aea4fa41551a30e30af803",
  "actions/setup-node": "249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/setup-go": "924ae3a1cded613372ab5595356fb5720e22ba16",
  "actions/upload-artifact": "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  "actions/download-artifact": "9000827ccba6bdab643e8b6fd33ac0654aef8333",
};

function steps(workflow) {
  return Object.values(workflow.jobs).flatMap((job) => job.steps || []);
}
const matching = (items, text) =>
  items.findIndex((step) => step.run?.includes(text));

test("branch and PR verification stays read-only and supports the native release matrix", () => {
  assert.deepEqual(verify.on.push.branches, ["**"]);
  assert.ok(Object.hasOwn(verify.on, "pull_request"));
  assert.equal(verify.on.workflow_call.inputs.release_version.type, "string");
  assert.equal(verify.on.workflow_call.inputs.release_version.default, "");
  assert.deepEqual(verify.permissions, { contents: "read" });
  assert.deepEqual(verify.jobs.verify.strategy.matrix.include, [
    { runner: "ubuntu-24.04", arch: "amd64" },
    { runner: "ubuntu-24.04-arm", arch: "arm64" },
  ]);
  assert.ok(
    !verify.jobs.verify.permissions ||
      verify.jobs.verify.permissions.contents === "read",
  );
  assert.equal(
    steps(verify).some((step) => step.env?.GH_TOKEN),
    false,
  );
  for (const value of [
    "github.com/rhysd/actionlint/cmd/actionlint@v1.7.12",
    "npm run test:release",
    "npm run test:web",
    "playwright test",
    "go test -race",
    "govulncheck",
    "npm audit",
    "OpenPGP",
  ])
    assert.ok(
      steps(verify).some((step) => step.run?.includes(value)),
      value,
    );
});

test("release entry points validate tags and reuse full verification without inheriting secrets", () => {
  assert.deepEqual(release.on.push.tags, ["v*"]);
  assert.ok(Object.hasOwn(release.on, "workflow_dispatch"));
  assert.equal(Object.hasOwn(release.on, "pull_request"), false);
  assert.deepEqual(release.permissions, { contents: "read" });
  assert.equal(
    release.jobs.metadata.steps.at(-1).run,
    "node scripts/release.mjs metadata",
  );
  assert.deepEqual(release.jobs.verify.needs, "metadata");
  assert.equal(release.jobs.verify.uses, "./.github/workflows/ci.yaml");
  assert.deepEqual(release.jobs.verify.permissions, { contents: "read" });
  assert.equal(release.jobs.verify.secrets, undefined);
  assert.equal(
    release.jobs.verify.with.release_version,
    "${{ needs.metadata.outputs.version }}",
  );
  assert.deepEqual(release.jobs.publish.needs, ["metadata", "verify"]);
  assert.match(release.jobs.publish.if, /github\.ref_type == 'tag'/);
});

test("only the serialized environment-scoped publisher gets registry and release write permissions", () => {
  assert.deepEqual(release.jobs.publish.permissions, {
    contents: "write",
    packages: "write",
  });
  assert.equal(release.jobs.publish.environment, "release");
  assert.deepEqual(release.jobs.publish.concurrency, {
    group: "release-publish-${{ github.repository }}",
    "cancel-in-progress": false,
  });
  assert.equal(release.concurrency["cancel-in-progress"], false);
  assert.match(verify.concurrency.group, /^verify-/);
  assert.match(release.concurrency.group, /^release-/);
  for (const [name, job] of Object.entries(release.jobs))
    if (name !== "publish") {
      assert.ok(!job.permissions || job.permissions.contents === "read");
      assert.equal(job.permissions?.packages, undefined);
    }
  assert.equal(release.jobs.publish.env, undefined);
  const credentials = release.jobs.publish.steps.filter(
    (step) => step.env?.DOCKER_CONFIG,
  );
  assert.equal(credentials.length, 3);
  for (const step of credentials)
    assert.equal(
      step.env.DOCKER_CONFIG,
      "${{ runner.temp }}/nexa-release-docker",
    );
  assert.equal(release.jobs.publish.steps.at(-1).if, "${{ always() }}");
  assert.equal(release.jobs.publish.steps.at(-1).run, "docker logout ghcr.io");
});

test("runner-scoped values are never evaluated in job-level environment expressions", () => {
  const available = new Set([
    "github",
    "needs",
    "strategy",
    "matrix",
    "vars",
    "secrets",
    "inputs",
  ]);
  for (const workflow of [verify, release])
    for (const job of Object.values(workflow.jobs))
      for (const value of Object.values(job.env || {}))
        for (const match of String(value).matchAll(
          /\$\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\./g,
        ))
          assert.ok(
            available.has(match[1]),
            `Unavailable job-level context: ${match[1]}`,
          );
});

test("artifact export occurs only after every existing gate and retains no runtime logs or data", () => {
  const list = verify.jobs.verify.steps;
  const build = matching(list, "docker buildx build");
  const deployed = matching(list, "npm run test:container");
  const scanned = matching(list, "npm run scan:image");
  const packaged = matching(list, "node scripts/release.mjs package");
  const uploaded = list.findIndex((step) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  );
  assert.ok(
    build >= 0 &&
      build < deployed &&
      deployed < scanned &&
      scanned < packaged &&
      packaged < uploaded,
  );
  assert.ok(list[build].run.includes('--build-arg "VERSION=$BUILD_VERSION"'));
  assert.ok(list[build].run.includes('--build-arg "REVISION=$BUILD_REVISION"'));
  assert.equal(
    list[build].env.BUILD_REVISION,
    "${{ steps.version.outputs.revision }}",
  );
  assert.ok(list.some((step) => step.run?.includes("git rev-parse HEAD")));
  assert.ok(list[packaged].run.includes("-mode=binary"));
  for (const step of [list[packaged], list[uploaded]]) {
    assert.match(step.if, /inputs\.release_version != ''/);
    assert.match(step.if, /github\.ref_type == 'tag'/);
  }
  assert.deepEqual(list[uploaded].with, {
    name: "release-linux-${{ matrix.arch }}",
    path: "release-artifacts/${{ matrix.arch }}/",
    "if-no-files-found": "error",
    "retention-days": 7,
    overwrite: true,
    "compression-level": 0,
    "include-hidden-files": false,
    archive: true,
  });
  assert.equal(
    list.some(
      (step) => step["continue-on-error"] || step.if?.includes("always()"),
    ),
    false,
  );
});

test("publication downloads only this run's separate artifacts and validates them before login", () => {
  const list = release.jobs.publish.steps;
  const download = list.find((step) =>
    step.uses?.startsWith("actions/download-artifact@"),
  );
  assert.deepEqual(download.with, {
    pattern: "release-linux-*",
    path: "release-artifacts",
    "merge-multiple": false,
    "skip-decompress": false,
  });
  assert.ok(
    matching(list, "node scripts/release.mjs verify") <
      matching(list, "docker login"),
  );
  assert.ok(
    matching(list, "docker login") <
      matching(list, "node scripts/release.mjs publish"),
  );
  assert.equal(
    list.some((step) =>
      /npm (?:ci|install)|go build|docker buildx build/.test(step.run || ""),
    ),
    false,
  );
  const login = list.find((step) => step.run?.includes("docker login"));
  assert.match(login.run, /--password-stdin/);
  assert.equal(login.env.GH_TOKEN, "${{ github.token }}");
});

test("every external action is an explicitly reviewed official commit and checkout never persists credentials", () => {
  for (const workflow of [verify, release]) {
    for (const step of steps(workflow)) {
      if (!step.uses) continue;
      const [name, commit] = step.uses.split("@");
      assert.equal(commit, actions[name], `Unreviewed action: ${step.uses}`);
      assert.match(commit, /^[a-f0-9]{40}$/);
      if (name === "actions/checkout") {
        assert.equal(step.with["persist-credentials"], false);
        if (step.with.ref) assert.equal(step.with.ref, "${{ github.sha }}");
      }
    }
  }
});

test("workflow shell blocks parse without executing and never interpolate GitHub event text into shell source", () => {
  for (const workflow of [verify, release])
    for (const step of steps(workflow)) {
      if (!step.run) continue;
      assert.equal(
        step.run.includes("${{"),
        false,
        "Use quoted environment variables instead of expression interpolation in shell",
      );
      const result = spawnSync("bash", ["-n"], {
        encoding: "utf8",
        input: step.run,
      });
      assert.equal(result.status, 0, `${step.name}: shell syntax`);
    }
});
