import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";

const readWorkflow = (name) =>
  YAML.parse(readFileSync(`.github/workflows/${name}.yaml`, "utf8"));
const verify = readWorkflow("ci");
const release = readWorkflow("release");
const pullRequest = readWorkflow("pull-request");
const workflows = [verify, release, pullRequest];
const actions = {
  "actions/checkout": "d23441a48e516b6c34aea4fa41551a30e30af803",
  "actions/setup-node": "249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/setup-go": "924ae3a1cded613372ab5595356fb5720e22ba16",
  "actions/upload-artifact": "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  "actions/download-artifact": "9000827ccba6bdab643e8b6fd33ac0654aef8333",
};
const steps = (workflow) =>
  Object.values(workflow.jobs).flatMap((job) => job.steps || []);
const matching = (items, text) =>
  items.findIndex((step) => step.run?.includes(text));

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
  assert.equal(credentials.length, 3);
  for (const step of credentials)
    assert.equal(
      step.env.DOCKER_CONFIG,
      "${{ runner.temp }}/nexa-release-docker",
    );
  assert.equal(release.jobs.publish.steps.at(-1).if, "${{ always() }}");
  assert.equal(release.jobs.publish.steps.at(-1).run, "docker logout ghcr.io");
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
      /npm (?:ci|install)|go build|docker buildx build|semantic-release-action/.test(
        step.run || "",
      ),
    ),
    false,
  );
  const login = list.find((step) => step.run?.includes("docker login"));
  assert.match(login.run, /--password-stdin/);
  assert.equal(login.env.GH_TOKEN, "${{ github.token }}");
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
  for (const workflow of workflows)
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
});

test("all workflow shell blocks parse without execution and never interpolate event data into shell source", () => {
  for (const workflow of workflows)
    for (const step of steps(workflow)) {
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
