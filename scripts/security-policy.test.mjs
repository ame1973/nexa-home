import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import YAML from "yaml";

test("a changed builder cannot reuse stale CA bundle provenance", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "nexa-ca-policy-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "deploy"));
  mkdirSync(join(directory, "licenses"));
  const dockerfile = readFileSync("deploy/Dockerfile", "utf8");
  const builder = dockerfile.match(/golang:[^@\s]+@sha256:[a-f0-9]{64}/);
  assert.ok(builder);
  const changed = builder[0].replace(/.$/, (last) =>
    last === "0" ? "1" : "0",
  );
  writeFileSync(
    join(directory, "deploy/Dockerfile"),
    dockerfile.replace(builder[0], changed),
  );
  writeFileSync(
    join(directory, "licenses/mozilla-ca-certificates.txt"),
    readFileSync("licenses/mozilla-ca-certificates.txt"),
  );
  const result = spawnSync(
    process.execPath,
    [resolve("scripts/notices.mjs"), "--check"],
    {
      cwd: directory,
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Review the CA bundle provenance when the builder image changes/,
  );
});

test("the reviewed scanner exception cannot silently broaden or outlive its review", () => {
  const policy = YAML.parse(readFileSync(".trivyignore.yaml", "utf8"));
  assert.deepEqual(Object.keys(policy), ["vulnerabilities"]);
  assert.equal(policy.vulnerabilities.length, 1);
  const rule = policy.vulnerabilities[0];
  assert.deepEqual(Object.keys(rule).sort(), [
    "expired_at",
    "id",
    "paths",
    "purls",
    "statement",
  ]);
  assert.equal(rule.id, "GO-2026-5932");
  assert.deepEqual(rule.paths, ["nexa-home"]);
  assert.deepEqual(rule.purls, ["pkg:golang/golang.org/x/crypto@v0.58.0"]);
  assert.equal(rule.expired_at, "2027-02-01");
  const expiry = Date.parse(`${rule.expired_at}T00:00:00Z`);
  assert.ok(
    expiry > Date.now(),
    "The exception expired; reassess rather than extending it silently",
  );
  assert.ok(expiry - Date.parse("2026-11-05T00:00:00Z") <= 90 * 86400_000);
  assert.match(rule.statement, /OpenPGP remains unused/);
  assert.match(rule.statement, /transitive OpenPGP/);
  assert.match(rule.statement, /suppressed finding remains visible/);
});
