import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreferencesProvider, usePreferences } from "@/app/preferences";
import { settings } from "@/test/fixtures";
import {
  appearanceFields,
  readThemeFile,
  readThemeLibrary,
  type Appearance,
  type PersonalAppearance,
} from "./themes";

const source = readFileSync("public/theme-init.js", "utf8");
function prepaint({
  search = "",
  stored = {} as Record<string, string>,
  dark = false,
  blocked = false,
} = {}) {
  const document =
    globalThis.document.implementation.createHTMLDocument("Appearance fixture");
  const nonce = document.createElement("meta");
  nonce.name = "nexa-style-nonce";
  nonce.content = "a".repeat(43) + "=";
  document.head.append(nonce);
  const context = {
    document,
    window: {} as Window,
    location: { search },
    URLSearchParams,
    TextEncoder,
    matchMedia: () => ({ matches: dark }),
    localStorage: {
      getItem: (key: string) => {
        if (blocked) throw new Error("No storage");
        return stored[key] ?? null;
      },
    },
  };
  runInNewContext(source, context);
  return { document, theme: context.window.NexaTheme };
}

const personal = (
  themePreset: PersonalAppearance["themePreset"],
): PersonalAppearance => ({ themePreset, customTheme: null, customCSS: "" });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider appearance={settings}>{children}</PreferencesProvider>
);

describe("shared pre-paint theme engine", () => {
  it("provides five complete distinct presets and ten contrast-checked palettes", () => {
    const { theme } = prepaint();
    expect(theme.presets).toEqual([
      "future-glass",
      "graphite",
      "tide",
      "forest",
      "dune",
    ]);
    const backgrounds = new Set<string>();
    for (const preset of theme.presets) {
      const definition = theme.definition(preset, "My theme");
      expect(theme.validTheme(definition)).toBe(true);
      expect(theme.parseTheme(JSON.stringify(definition))).toEqual(definition);
      for (const mode of ["dark", "light"] as const) {
        const tokens = theme.tokens({ themePreset: preset }, mode);
        backgrounds.add(tokens["--bg"]!);
        for (const background of ["--bg", "--surface", "--surface-elevated"]) {
          for (const color of [
            "--text-primary",
            "--text-secondary",
            "--accent-ink",
            "--danger",
          ])
            expect(
              theme.contrast(tokens[color]!, tokens[background]!),
              `${preset} ${mode} ${color}/${background}`,
            ).toBeGreaterThanOrEqual(4.5);
          for (const color of ["--control-border", "--focus"])
            expect(
              theme.contrast(tokens[color]!, tokens[background]!),
              `${preset} ${mode} ${color}/${background}`,
            ).toBeGreaterThanOrEqual(3);
        }
        expect(
          theme.contrast(tokens["--accent"]!, tokens["--primary-foreground"]!),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(backgrounds.size).toBe(10);
  });

  it("derives readable semantic tokens even for extreme custom colors", () => {
    const { theme } = prepaint();
    for (const background of [
      "#000000",
      "#ffffff",
      "#808080",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#747474",
    ]) {
      const definition = theme.definition("tide", "Custom colors");
      definition.variants.dark = {
        background,
        surface: background,
        accent: "#808080",
      };
      expect(theme.validTheme(definition)).toBe(true);
      const tokens = theme.tokens(
        { themePreset: "custom", customTheme: definition },
        "dark",
      );
      for (const surface of ["--bg", "--surface", "--surface-elevated"]) {
        for (const text of [
          "--text-primary",
          "--text-secondary",
          "--accent-ink",
          "--danger",
        ])
          expect(
            theme.contrast(tokens[text]!, tokens[surface]!),
          ).toBeGreaterThanOrEqual(4.5);
        expect(
          theme.contrast(tokens["--control-border"]!, tokens[surface]!),
        ).toBeGreaterThanOrEqual(3);
      }
    }
    const definition = theme.definition("tide", "Complementary surfaces");
    definition.variants.dark = {
      background: "#00ff00",
      surface: "#ff0000",
      accent: "#cc3300",
    };
    const tokens = theme.tokens(
      { themePreset: "custom", customTheme: definition },
      "dark",
    );
    expect(
      theme.contrast(tokens["--text-primary"]!, tokens["--surface-elevated"]!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("validates bounded token JSON including unknown, duplicate and escaped duplicate keys", () => {
    const { theme } = prepaint();
    const definition = theme.definition("forest", "Forest copy");
    const valid = JSON.stringify(definition);
    for (const invalid of [
      "null",
      "[]",
      valid + "{}",
      " ".repeat(16384) + valid,
      valid.replace('"name":"Forest copy"', '"name":"One","name":"Two"'),
      valid.replace('"name":"Forest copy"', '"name":"One","\\u006eame":"Two"'),
      JSON.stringify({ ...definition, css: "body{}" }),
      JSON.stringify({ ...definition, schemaVersion: 2 }),
      JSON.stringify({ ...definition, radius: 999 }),
      JSON.stringify({ ...definition, shadow: "url(remote)" }),
      JSON.stringify({ ...definition, name: "\ud800" }),
      JSON.stringify({
        ...definition,
        variants: {
          ...definition.variants,
          dark: {
            background: "#000000",
            surface: "#ffffff",
            accent: "#008080",
          },
        },
      }),
    ])
      expect(() => theme.parseTheme(invalid)).toThrow();
    expect(theme.parseTheme(valid).name).toBe("Forest copy");
  });

  it("accepts arbitrary CSS but bounds UTF-8 bytes, NUL and malformed Unicode", () => {
    const { theme } = prepaint();
    for (const css of [
      "",
      "@import url(https://example.invalid/theme.css); @layer anything { body:has(a) { color: red!important; } }",
      "</style><script>not executed</script>",
      "a".repeat(65536),
    ])
      expect(theme.validCSS(css)).toBe(true);
    for (const css of [
      null,
      {},
      "a".repeat(65537),
      "森".repeat(21846),
      "\0",
      "\ud800",
    ])
      expect(theme.validCSS(css)).toBe(false);
  });

  it("injects CSS as nonce-bearing text, never HTML, and removes it when disabled", () => {
    const { document, theme } = prepaint();
    const css =
      "/* </style><script>window.bad=true</script> */ body { letter-spacing: .01em; }";
    theme.apply({ customCSS: css });
    const style = document.getElementById(
      "nexa-custom-css",
    ) as HTMLStyleElement;
    expect(style.nonce).toBe("a".repeat(43) + "=");
    expect(style.textContent).toBe(css);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    theme.apply({ themePreset: "dune", customCSS: "" });
    expect(document.getElementById("nexa-custom-css")).toBeNull();
    expect(document.documentElement.dataset.themePreset).toBe("dune");
  });

  it("applies legacy mode and personal style before paint, without inheriting site CSS", () => {
    const { document, theme } = prepaint({
      dark: true,
      stored: {
        "nexa.appearance": JSON.stringify({
          theme: "light",
          themePreset: "forest",
          customCSS: "body{display:none}",
        }),
        "nexa.theme": "system",
        "nexa.personalAppearance": JSON.stringify(personal("tide")),
      },
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themePreset).toBe("tide");
    expect(document.getElementById("nexa-custom-css")).toBeNull();
    theme.apply(theme.readAppearance(), null, null);
    expect(document.documentElement.dataset.themePreset).toBe("forest");
    expect(document.getElementById("nexa-custom-css")).not.toBeNull();
  });

  it("latches cosmetic-only safe mode without changing stored preferences", () => {
    const stored = {
      "nexa.appearance": JSON.stringify({
        theme: "light",
        themePreset: "custom",
        customTheme: window.NexaTheme.definition("forest", "Hidden"),
        customCSS: "*{display:none!important}",
      }),
      "nexa.personalAppearance": JSON.stringify(personal("graphite")),
    };
    const original = JSON.stringify(stored);
    const { document, theme } = prepaint({
      search: "?appearance=safe",
      stored,
    });
    expect(theme.safeMode).toBe(true);
    expect(document.documentElement.dataset.themePreset).toBe("future-glass");
    expect(document.documentElement.dataset.glass).toBe("false");
    theme.apply({
      themePreset: "custom",
      customTheme: theme.definition("dune", "Custom"),
      customCSS: "*{display:none}",
    });
    expect(document.getElementById("nexa-custom-css")).toBeNull();
    expect(document.documentElement.dataset.themePreset).toBe("future-glass");
    expect(JSON.stringify(stored)).toBe(original);
  });

  it.each([
    "null",
    "[]",
    "{",
    '"constructor"',
    JSON.stringify({
      themePreset: "constructor",
      customCSS: 42,
      customTheme: { invalid: true },
    }),
  ])("falls back safely from corrupt storage %s", (value) => {
    const { document, theme } = prepaint({
      stored: { "nexa.appearance": value, "nexa.personalAppearance": value },
    });
    expect(document.documentElement.dataset.themePreset).toBe("future-glass");
    expect(theme.readPersonal()).toBeNull();
  });
  it("renders when browser storage is unavailable", () => {
    expect(
      prepaint({ blocked: true }).document.documentElement.dataset.theme,
    ).toBe("dark");
  });
});

it("persists personal style independently of mode and restores the site as a unit", () => {
  const { result } = renderHook(usePreferences, { wrapper });
  act(() => {
    expect(result.current.setPersonal(personal("dune"))).toBe(true);
    result.current.setTheme("light");
  });
  expect(document.documentElement.dataset.themePreset).toBe("dune");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("nexa.theme")).toBe("light");
  expect(
    JSON.parse(localStorage.getItem("nexa.personalAppearance")!).themePreset,
  ).toBe("dune");
  act(() => {
    result.current.setPersonal(null);
  });
  expect(document.documentElement.dataset.themePreset).toBe("future-glass");
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("previews temporarily without changing storage and restores with Escape", () => {
  const { result } = renderHook(usePreferences, { wrapper });
  const original = JSON.stringify(localStorage);
  act(() =>
    result.current.setPreview({
      themePreset: "tide",
      theme: "light",
      customCSS: "body { --preview-active: 1; }",
    }),
  );
  expect(document.documentElement.dataset.themePreset).toBe("tide");
  expect(document.getElementById("nexa-custom-css")).not.toBeNull();
  expect(JSON.stringify(localStorage)).toBe(original);
  act(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );
  expect(result.current.preview).toBeNull();
  expect(document.documentElement.dataset.themePreset).toBe("future-glass");
  expect(document.getElementById("nexa-custom-css")).toBeNull();
});

it("stores only appearance fields and validates the bounded local theme library", () => {
  const fields = appearanceFields({
    ...settings,
    siteTitle: "Never cache this",
  } as Appearance);
  expect(fields).not.toHaveProperty("siteTitle");
  expect(fields).not.toHaveProperty("revision");
  const entries = Array.from({ length: 10 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    theme: window.NexaTheme.definition("tide", `Theme ${index}`),
  }));
  localStorage.setItem("nexa.themes", JSON.stringify(entries));
  expect(readThemeLibrary()).toEqual(entries);
  localStorage.setItem("nexa.themes", JSON.stringify([...entries, entries[0]]));
  expect(readThemeLibrary()).toEqual([]);
  localStorage.setItem("nexa.themes", JSON.stringify([entries[0], entries[0]]));
  expect(readThemeLibrary()).toEqual([]);
  localStorage.setItem(
    "nexa.themes",
    JSON.stringify([{ ...entries[0], id: "constructor" }]),
  );
  expect(readThemeLibrary()).toEqual([]);
});

it("keeps local drafts when storage fails rather than falsely reporting a save", () => {
  const { result } = renderHook(usePreferences, { wrapper });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota");
  });
  act(() => expect(result.current.setPersonal(personal("forest"))).toBe(false));
  expect(result.current.personal).toBeNull();
  expect(
    result.current.setLibrary([
      {
        id: crypto.randomUUID(),
        theme: window.NexaTheme.definition("tide", "Copy"),
      },
    ]),
  ).toBe(false);
});

it("reads only bounded, fatal UTF-8 theme/CSS files", async () => {
  await expect(
    readThemeFile(new File(["x".repeat(16385)], "theme.json"), "json"),
  ).rejects.toThrow();
  await expect(
    readThemeFile(new File([new Uint8Array([0xff])], "theme.css"), "css"),
  ).rejects.toThrow();
  await expect(
    readThemeFile(new File(["body{}"], "theme.css"), "css"),
  ).resolves.toBe("body{}");
});
