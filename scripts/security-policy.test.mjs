import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import YAML from "yaml";

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
