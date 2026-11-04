import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { externalizeSonnerStyles, sonnerCSP } from "./sonner-csp.mjs";

test("externalizes the pinned Sonner stylesheet without evaluating package code", () => {
  const source = `export const ready=true;\n__insertCSS(${JSON.stringify('[data-sonner-toaster]{content:"test"}')});`;
  const transformed = externalizeSonnerStyles(source);
  assert.ok(transformed.startsWith('import "sonner/dist/styles.css";'));
  assert.ok(transformed.includes("export const ready=true;"));
  assert.ok(!transformed.includes("__insertCSS("));
});
test("fails closed on missing, ambiguous or nonliteral style injection", () => {
  for (const source of [
    "",
    "__insertCSS(run());",
    '__insertCSS("not a stylesheet");',
    '__insertCSS("[data-sonner-toaster]");\n__insertCSS("[data-sonner-toaster]");',
  ])
    assert.throws(() => externalizeSonnerStyles(source));
});
test("the locked package is transformable and unrelated files remain untouched", async () => {
  const source = await readFile(
    new URL("../node_modules/sonner/dist/index.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    externalizeSonnerStyles(source).includes(
      'import "sonner/dist/styles.css";',
    ),
  );
  assert.equal(
    sonnerCSP().transform("untouched", "/project/src/app.tsx"),
    null,
  );
  const transformed = sonnerCSP().transform(
    source,
    "/node_modules/sonner/dist/index.mjs",
  ).code;
  const blur = transformed.match(
    /onBlur: \(event\)=>\{[\s\S]*?\n            onFocus:/,
  )?.[0];
  assert.ok(blur && !blur.includes("lastFocusedElementRef.current.focus"));
  assert.ok(blur.includes("isFocusWithinRef.current = false"));
  assert.ok(blur.includes("lastFocusedElementRef.current = null"));
});
