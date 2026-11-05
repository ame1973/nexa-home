import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";

const translations = [
  ["readme.md", "readme.zh-Hant.md"],
  ["SECURITY.md", "SECURITY.zh-Hant.md"],
  ["CHANGELOG.md", "CHANGELOG.zh-Hant.md"],
  ["docs/deployment.md", "docs/zh-Hant/deployment.md"],
  ["docs/backup-and-recovery.md", "docs/zh-Hant/backup-and-recovery.md"],
  ["docs/release-notes-1.0.0.md", "docs/zh-Hant/release-notes-1.0.0.md"],
  ["licenses/readme.md", "licenses/readme.zh-Hant.md"],
];
const documents = translations.flat();

function operationalExamples(source) {
  return [
    ...source.matchAll(/^[ \t]*```(sh|yaml|dotenv)\n([\s\S]*?)^[ \t]*```/gm),
  ].map(([, language, body]) => ({ language, body: body.trim() }));
}

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
    for (const { language, body } of operationalExamples(source)) {
      if (language !== "sh") continue;
      const parsed = spawnSync("sh", ["-n"], { input: body, encoding: "utf8" });
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

test("Traditional Chinese documents retain language navigation, sections and exact operational examples", () => {
  for (const [english, translated] of translations) {
    const original = readFileSync(english, "utf8");
    const localized = readFileSync(translated, "utf8");
    const forward = relative(dirname(english), translated).split(sep).join("/");
    const backward = relative(dirname(translated), english)
      .split(sep)
      .join("/");
    assert.ok(
      original.includes(`](${forward})`),
      `${english}: missing translation link`,
    );
    assert.ok(
      localized.includes(`](${backward})`),
      `${translated}: missing English link`,
    );
    assert.equal(
      (localized.match(/^#{1,6} /gm) || []).length,
      (original.match(/^#{1,6} /gm) || []).length,
      `${translated}: translated section structure`,
    );
    assert.deepEqual(
      operationalExamples(localized),
      operationalExamples(original),
      `${translated}: commands and configuration must remain identical to English`,
    );
  }
});
