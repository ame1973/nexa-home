export function externalizeSonnerStyles(source) {
  // Sonner 2.0.8 appends an empty style element before its text, which violates
  // hash-based CSP. Use its public CSS export instead; never allow inline CSS.
  const calls = [
    ...source.matchAll(/^__insertCSS\(("(?:[^"\\]|\\.)*")\);?$/gm),
  ];
  if (
    calls.length !== 1 ||
    !JSON.parse(calls[0][1]).includes("[data-sonner-toaster]")
  ) {
    throw new Error(
      "Review the pinned Sonner CSS integration before updating the dependency.",
    );
  }
  return `import "sonner/dist/styles.css";\n${source.replace(calls[0][0], "")}`;
}

function preserveNormalTabOrder(source) {
  // Sonner's blur restoration sends normal Tab navigation back to the last
  // control before the toaster, creating a forward-tab loop after a table.
  const blur = source.match(
    /onBlur: \(event\)=>\{[\s\S]*?\n            onFocus:/,
  )?.[0];
  const restore =
    /lastFocusedElementRef\.current\.focus\(\{\s*preventScroll: true\s*\}\);/;
  if (!blur || !restore.test(blur))
    throw new Error("Review the pinned Sonner keyboard-focus integration.");
  return source.replace(blur, blur.replace(restore, ""));
}

/** @returns {import('vite').Plugin} */
export function sonnerCSP() {
  return {
    name: "nexa-sonner-external-css",
    enforce: "pre",
    transform(source, id) {
      if (
        !id
          .split("?")[0]
          .replaceAll("\\", "/")
          .endsWith("/sonner/dist/index.mjs")
      )
        return null;
      return {
        code: preserveNormalTabOrder(externalizeSonnerStyles(source)),
        map: null,
      };
    },
  };
}
