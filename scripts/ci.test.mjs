import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";
import { fixtureEnvironment } from "./release-test-env.mjs";

const readWorkflow = (name) =>
  YAML.parse(readFileSync(`.github/workflows/${name}.yaml`, "utf8"));
const verify = readWorkflow("ci");
const release = readWorkflow("release");
const pullRequest = readWorkflow("pull-request");
const workflows = [verify, release, pullRequest];
const toolchain = YAML.parse(
  readFileSync(".github/actions/docker-toolchain/action.yaml", "utf8"),
);
const toolchainPath = "./.github/actions/docker-toolchain";
const actions = {
  "actions/checkout": "d23441a48e516b6c34aea4fa41551a30e30af803",
  "actions/setup-node": "249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/setup-go": "924ae3a1cded613372ab5595356fb5720e22ba16",
  "actions/upload-artifact": "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  "actions/download-artifact": "9000827ccba6bdab643e8b6fd33ac0654aef8333",
  "docker/setup-docker-action": "3f1ab1ab0e29231562e4db4ca600c1a49653bac6",
  "docker/setup-buildx-action": "f87e5991a6d7451dcb8d9637bfbc97413f497069",
  "docker/build-push-action": "c3c9e263c25d99ce0380d002d59b67737d91b0dc",
  "docker/login-action": "8aa5831fb8d48d8f76594c7ddde61ae58019f550",
};
const steps = (workflow) =>
  Object.values(workflow.jobs).flatMap((job) => job.steps || []);
const matching = (items, text) =>
  items.findIndex((step) => step.run?.includes(text));
const actionAt = (items, name) =>
  items.findIndex((step) => step.uses?.startsWith(`${name}@`));
const allSteps = () => [...workflows.flatMap(steps), ...toolchain.runs.steps];

const retention = {
  "if-no-files-found": "error",
  "retention-days": 7,
  overwrite: true,
  "compression-level": 0,
  "include-hidden-files": false,
  archive: true,
};

test("branch/PR verification remains read-only; master reuses it without duplicate push runs", () => {
  assert.deepEqual(verify.on.push, { "branches-ignore": ["master"] });
  assert.ok(Object.hasOwn(verify.on, "pull_request"));
  for (const name of ["release_version", "release_plan_digest"]) {
    assert.equal(verify.on.workflow_call.inputs[name].type, "string");
    assert.equal(verify.on.workflow_call.inputs[name].default, "");
  }
  assert.deepEqual(verify.permissions, { contents: "read" });
  assert.deepEqual(verify.jobs.verify.strategy.matrix.include, [
    { runner: "ubuntu-24.04", arch: "amd64" },
    { runner: "ubuntu-24.04-arm", arch: "arm64" },
  ]);
  assert.equal(
    steps(verify).some((step) => step.env?.GH_TOKEN),
    false,
  );
  for (const value of [
    "github.com/rhysd/actionlint/cmd/actionlint@v1.7.12",
    "pull-request.yaml",
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

test("Go verification always executes lifecycle tests instead of reusing cached results", () => {
  const list = verify.jobs.verify.steps;
  const check = list.find((step) => step.run?.includes("go test -race"));
  assert.ok(check.run.includes("go test -race -cover -count=1 ./..."));
  assert.ok(check.run.includes('test -z "$(gofmt -l api cmd db internal)"'));
  assert.ok(check.run.includes("go vet ./..."));
});

test("both build and publish use one pinned, platform-capable official Docker toolchain", () => {
  assert.equal(toolchain.runs.using, "composite");
  const setup =
    toolchain.runs.steps[
      actionAt(toolchain.runs.steps, "docker/setup-docker-action")
    ];
  assert.equal(setup.with.version, "v29.5.3");
  assert.equal(
    setup.with["set-host"],
    true,
    "All child Docker calls must select the newly installed daemon",
  );
  assert.equal(
    JSON.parse(setup.with["daemon-config"]).features["containerd-snapshotter"],
    true,
  );
  const buildx =
    toolchain.runs.steps[
      actionAt(toolchain.runs.steps, "docker/setup-buildx-action")
    ];
  assert.equal(buildx.with.version, "v0.38.2");
  assert.equal(
    buildx.with.driver,
    "docker",
    "Native jobs need no extra privileged builder or emulator",
  );
  assert.equal(buildx.with.cleanup, true);
  assert.equal(
    toolchain.outputs.builder.value,
    "${{ steps.buildx.outputs.name }}",
  );
  for (const list of [verify.jobs.verify.steps, release.jobs.publish.steps])
    assert.equal(list.filter((step) => step.uses === toolchainPath).length, 1);
});

for (const [report, valid] of [
  ["29.5.3 29.5.3 1.54 1.54", true],
  ["27.5.1 27.5.1 1.47 1.47", false],
  ["29.5.3 28.0.4 1.54 1.48", false],
  ["29.5.3 29.5.3 1.47 1.54", false],
  ["29.5.3 29.5.3 1.54 1.48", false],
  ["unexpected", false],
])
  test(`Docker toolchain preflight ${valid ? "accepts" : "rejects"} ${report}`, () => {
    const preflight = toolchain.runs.steps.find((step) => step.run);
    const fake =
      'docker() { case "$1" in version) printf "%s\\n" "$DOCKER_TEST_REPORT" ;; buildx|compose) printf "synthetic tool version\\n" ;; *) return 9 ;; esac; };\n';
    const result = spawnSync(
      "bash",
      ["-e", "-o", "pipefail", "-c", fake + preflight.run],
      {
        encoding: "utf8",
        env: { ...fixtureEnvironment(), DOCKER_TEST_REPORT: report },
      },
    );
    assert.equal(
      result.status === 0,
      valid,
      "Unsupported client/daemon/API combinations must fail before container acceptance",
    );
  });

test("master pushes plan semantic releases, tag compatibility remains, and dispatch defaults to preview", () => {
  assert.deepEqual(release.on.push, { branches: ["master"], tags: ["v*"] });
  assert.equal(Object.hasOwn(release.on, "pull_request"), false);
  assert.equal(release.on.workflow_dispatch.inputs.mode.default, "preview");
  assert.deepEqual(release.on.workflow_dispatch.inputs.mode.options, [
    "preview",
    "resume",
  ]);
  assert.deepEqual(release.permissions, { contents: "read" });
  const list = release.jobs.plan.steps;
  const checkout = list.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout.with["fetch-depth"], 0);
  assert.ok(
    matching(list, "npm ci --ignore-scripts") <
      matching(list, "node scripts/release-plan.mjs plan"),
  );
  assert.equal(release.jobs.verify.needs, "plan");
  assert.equal(
    release.jobs.verify.if,
    "${{ !cancelled() }}",
    "No-release and failed-plan commits still receive full verification",
  );
  assert.equal(release.jobs.verify.uses, "./.github/workflows/ci.yaml");
  assert.deepEqual(release.jobs.verify.permissions, { contents: "read" });
  assert.equal(release.jobs.verify.secrets, undefined);
  assert.equal(
    release.jobs.verify.with.release_version,
    "${{ needs.plan.result == 'success' && needs.plan.outputs.version || '' }}",
  );
  assert.equal(
    release.jobs.verify.with.release_plan_digest,
    "${{ needs.plan.result == 'success' && needs.plan.outputs.version != '' && needs.plan.outputs.plan_digest || '' }}",
  );
  assert.deepEqual(release.jobs.publish.needs, ["plan", "verify"]);
  assert.equal(
    release.jobs.publish.if,
    "${{ needs.plan.result == 'success' && needs.plan.outputs.publish == 'true' }}",
  );
  const upload = list.find((step) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  );
  assert.deepEqual(upload.with, {
    name: "release-plan",
    path: "release-plan/plan.json",
    ...retention,
  });
});

test("PR title edits have a separate read-only check and cannot replace failed source-verification checks", () => {
  assert.deepEqual(pullRequest.on.pull_request.types, [
    "opened",
    "edited",
    "synchronize",
    "reopened",
  ]);
  assert.deepEqual(pullRequest.permissions, { contents: "read" });
  assert.equal(Object.hasOwn(pullRequest.on, "pull_request_target"), false);
  assert.equal(
    pullRequest.jobs["conventional-title"].name,
    "Conventional PR title",
  );
  assert.ok(
    steps(pullRequest).some(
      (step) => step.run === "node scripts/release-plan.mjs check-pr",
    ),
  );
  assert.equal(verify.on.pull_request, null);
  assert.equal(verify.jobs.verify.if, undefined);
});

test("only the serialized environment-scoped publisher has write permissions or registry credentials", () => {
  assert.deepEqual(release.jobs.publish.permissions, {
    contents: "write",
    packages: "write",
  });
  assert.equal(release.jobs.publish.environment, "release");
  assert.deepEqual(release.jobs.publish.concurrency, {
    group: "release-publish-${{ github.repository }}",
    "cancel-in-progress": false,
  });
  assert.deepEqual(release.concurrency, {
    group: "release-${{ github.repository }}",
    "cancel-in-progress": false,
  });
  assert.match(verify.concurrency.group, /^verify-/);
  for (const workflow of workflows) {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (workflow === release && name === "publish") continue;
      assert.ok(!job.permissions || job.permissions.contents === "read");
      assert.equal(job.permissions?.packages, undefined);
      assert.equal(
        steps({ jobs: { job } }).some((step) => step.env?.DOCKER_CONFIG),
        false,
      );
    }
  }
  assert.deepEqual(release.jobs.publish.env, {
    NEXA_RELEASE_PLAN_DIGEST: "${{ needs.plan.outputs.plan_digest }}",
  });
  const credentials = release.jobs.publish.steps.filter(
    (step) => step.env?.DOCKER_CONFIG,
  );
  assert.equal(credentials.length, 4);
  for (const step of credentials)
    assert.equal(
      step.env.DOCKER_CONFIG,
      "${{ runner.temp }}/nexa-release-docker",
    );
  const login =
    release.jobs.publish.steps[
      actionAt(release.jobs.publish.steps, "docker/login-action")
    ];
  assert.equal(
    login.with.logout,
    true,
    "The official login action removes job credentials in its post step",
  );
  assert.ok(
    !release.jobs.publish.steps.some((step) =>
      step.run?.includes("docker login"),
    ),
  );
});

test("runner-scoped values never appear in job-level environment expressions", () => {
  const available = new Set([
    "github",
    "needs",
    "strategy",
    "matrix",
    "vars",
    "secrets",
    "inputs",
  ]);
  for (const workflow of workflows)
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

test("versioned builds require a source-bound plan and stamp all version files before dependency installation", () => {
  const list = verify.jobs.verify.steps;
  const download = list.find((step) =>
    step.uses?.startsWith("actions/download-artifact@"),
  );
  assert.equal(download.if, "${{ inputs.release_version != '' }}");
  assert.deepEqual(download.with, {
    name: "release-plan",
    path: "release-plan",
    "skip-decompress": false,
  });
  const stamp = matching(list, "node scripts/release.mjs stamp");
  assert.ok(
    stamp > list.indexOf(download) &&
      stamp < matching(list, "npm ci --ignore-scripts"),
  );
  assert.ok(list[stamp].run.includes('if [ -z "$NEXA_RELEASE_PLAN_DIGEST" ]'));
  assert.ok(list[stamp].run.includes("node scripts/release.mjs metadata"));
  assert.equal(
    verify.jobs.verify.env.NEXA_BUILD_VERSION,
    "${{ inputs.release_version }}",
  );
  assert.equal(
    verify.jobs.verify.env.NEXA_RELEASE_PLAN_DIGEST,
    "${{ inputs.release_plan_digest }}",
  );
});

test("artifact export follows every gate on both branch and tag releases and retains no runtime data", () => {
  const list = verify.jobs.verify.steps;
  const build = actionAt(list, "docker/build-push-action");
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
  assert.equal(
    list[build].with.context,
    ".",
    "Git context would ignore the validated version stamping",
  );
  assert.equal(list[build].with.file, "deploy/Dockerfile");
  assert.equal(list[build].with.builder, "${{ steps.docker.outputs.builder }}");
  assert.equal(list[build].with.platforms, "${{ env.NEXA_TEST_PLATFORM }}");
  assert.equal(list[build].with.tags, "${{ env.NEXA_TEST_IMAGE }}");
  assert.equal(list[build].with.load, true);
  assert.equal(
    list[build].with.push,
    false,
    "Read-only verification must never push an untested image",
  );
  assert.equal(list[build].with.provenance, false);
  assert.equal(list[build].with.allow, undefined);
  assert.equal(list[build].with.secrets, undefined);
  assert.equal(list[build].env.DOCKER_BUILD_RECORD_UPLOAD, "false");
  assert.equal(list[build].env.DOCKER_BUILD_SUMMARY, "false");
  assert.ok(
    list[build].with["build-args"].includes(
      "VERSION=${{ steps.version.outputs.version }}",
    ),
  );
  assert.ok(
    list[build].with["build-args"].includes(
      "REVISION=${{ steps.version.outputs.revision }}",
    ),
  );
  assert.ok(
    list[build].with["build-args"].includes(
      "SOURCE=https://github.com/${{ github.repository }}",
    ),
  );
  assert.ok(list.findIndex((step) => step.uses === toolchainPath) < build);
  assert.ok(list.some((step) => step.run?.includes("git rev-parse HEAD")));
  assert.ok(list[packaged].run.includes("-mode=binary"));
  for (const step of [list[packaged], list[uploaded]])
    assert.equal(step.if, "${{ inputs.release_version != '' }}");
  assert.deepEqual(list[uploaded].with, {
    name: "release-linux-${{ matrix.arch }}",
    path: "release-artifacts/${{ matrix.arch }}/",
    ...retention,
  });
  assert.equal(
    list.some(
      (step) => step["continue-on-error"] || step.if?.includes("always()"),
    ),
    false,
  );
});

test("publication downloads only this run's separate plan and architecture artifacts before registry login, without rebuilding", () => {
  const list = release.jobs.publish.steps;
  const downloads = list.filter((step) =>
    step.uses?.startsWith("actions/download-artifact@"),
  );
  assert.equal(downloads.length, 2);
  assert.deepEqual(downloads[0].with, {
    name: "release-plan",
    path: "release-plan",
    "skip-decompress": false,
  });
  assert.deepEqual(downloads[1].with, {
    pattern: "release-linux-*",
    path: "release-artifacts",
    "merge-multiple": false,
    "skip-decompress": false,
  });
  const loginAt = actionAt(list, "docker/login-action");
  const prepared = matching(list, "install -d -m 700");
  const toolsAt = list.findIndex((step) => step.uses === toolchainPath);
  assert.ok(matching(list, "node scripts/release.mjs verify") < prepared);
  assert.ok(prepared < toolsAt && toolsAt < loginAt);
  assert.ok(loginAt < matching(list, "node scripts/release.mjs publish"));
  assert.equal(
    list.some((step) =>
      /npm (?:ci|install)|go build|docker buildx build|semantic-release-action/.test(
        step.run || "",
      ),
    ),
    false,
  );
  assert.equal(
    actionAt(list, "docker/build-push-action"),
    -1,
    "Publication loads the exact verified archive; a second build is forbidden",
  );
  const login = list[loginAt];
  assert.deepEqual(login.with, {
    registry: "ghcr.io",
    username: "${{ github.actor }}",
    password: "${{ github.token }}",
    logout: true,
  });
  const source = readFileSync("scripts/release.mjs", "utf8");
  for (const match of source.matchAll(/from "([^"]+)"/g))
    assert.ok(
      match[1].startsWith("node:"),
      "The publisher must need no installed npm code",
    );
});

test("standalone tools are exact-locked without the unused semantic-release/npm publisher peer graph", () => {
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  for (const [name, version] of Object.entries({
    "@semantic-release/commit-analyzer": "13.0.1",
    "@semantic-release/release-notes-generator": "14.1.1",
    "conventional-changelog-conventionalcommits": "9.3.1",
  })) {
    assert.equal(root.devDependencies[name], version);
    assert.equal(lock.packages[`node_modules/${name}`].version, version);
  }
  assert.equal(
    root.scripts["test:web"],
    "npm run test --workspace=@nexa-home/web -- --maxWorkers=2",
  );
  assert.equal(lock.packages["node_modules/semantic-release"], undefined);
  assert.equal(lock.packages["node_modules/npm"], undefined);
  assert.match(readFileSync(".npmrc", "utf8"), /^legacy-peer-deps=true$/m);
  assert.match(
    readFileSync("deploy/Dockerfile", "utf8"),
    /npm ci --ignore-scripts --legacy-peer-deps/,
  );
  assert.equal(
    JSON.parse(readFileSync("apps/web/package.json", "utf8")).devDependencies[
      "@testing-library/dom"
    ],
    "10.4.2",
  );
});

test("every external action uses a reviewed official SHA and checkout never persists credentials or follows a moving branch", () => {
  for (const step of allSteps()) {
    if (!step.uses) continue;
    if (step.uses.startsWith("./")) {
      assert.equal(
        step.uses,
        toolchainPath,
        "Only the reviewed local toolchain composite is permitted",
      );
      continue;
    }
    const [name, commit] = step.uses.split("@");
    assert.equal(commit, actions[name], `Unreviewed action: ${step.uses}`);
    assert.match(commit, /^[a-f0-9]{40}$/);
    if (name === "actions/checkout") {
      assert.equal(step.with["persist-credentials"], false);
      if (step.with.ref) assert.equal(step.with.ref, "${{ github.sha }}");
    }
  }
});

test("all workflow and composite shell blocks parse without execution and never interpolate event data into shell source", () => {
  for (const step of allSteps()) {
    if (!step.run) continue;
    assert.equal(
      step.run.includes("${{"),
      false,
      "Use files or quoted environment variables, not shell expression interpolation",
    );
    const result = spawnSync("bash", ["-n"], {
      encoding: "utf8",
      input: step.run,
    });
    assert.equal(result.status, 0, `${step.name}: shell syntax`);
  }
});
