import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import test from "node:test";

const documents = [
  "readme.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "docs/deployment.md",
  "docs/backup-and-recovery.md",
  "docs/release-notes-1.0.0.md",
  "licenses/readme.md",
];

test("product documentation links resolve and shell examples parse without execution", (t) => {
  const root = resolve(".");
  let links = 0;
  let scripts = 0;
  for (const name of documents) {
    const file = resolve(name);
    const source = readFileSync(file, "utf8");
    for (const [, target] of source.matchAll(/\]\(([^\s)]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#"))
        continue;
      const path = resolve(
        dirname(file),
        decodeURIComponent(target.split("#")[0]),
      );
      assert.ok(
        path.startsWith(root + sep),
        `${name}: link leaves the source tree`,
      );
      assert.ok(existsSync(path), `${name}: missing local link ${target}`);
      links++;
    }
    for (const [, script] of source.matchAll(
      /^[ \t]*```sh\n([\s\S]*?)^[ \t]*```/gm,
    )) {
      const parsed = spawnSync("sh", ["-n"], {
        input: script,
        encoding: "utf8",
      });
      assert.equal(parsed.status, 0, `${name}: shell example syntax`);
      scripts++;
    }
  }
  assert.ok(
    links > 0 && scripts > 0,
    "The check must exercise links and shell examples",
  );
  t.diagnostic(
    `${documents.length} product documents, ${links} local links and ${scripts} non-executed shell examples checked.`,
  );
});
