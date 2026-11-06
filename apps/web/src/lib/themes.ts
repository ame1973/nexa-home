import type { components } from "./api/schema";
import type { Settings } from "./api/client";

export type CustomTheme = components["schemas"]["CustomTheme"];
export type ThemePalette = components["schemas"]["ThemePalette"];
export type ThemePreset = components["schemas"]["ThemePreset"];
export type BuiltinPreset = Exclude<ThemePreset, "custom">;
export type ThemeChoice = "dark" | "light" | "system" | null;
export type Appearance = Partial<
  Pick<
    Settings,
    | "theme"
    | "accent"
    | "cardDensity"
    | "glassEnabled"
    | "themePreset"
    | "customTheme"
    | "customCSS"
  >
>;
export type PersonalAppearance = {
  themePreset: ThemePreset;
  customTheme: CustomTheme | null;
  customCSS: string;
};
export type ThemeLibraryEntry = { id: string; theme: CustomTheme };

export function preference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function persist(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// Cache only public presentation fields, never the settings response or catalog.
export function appearanceFields(value: Appearance): Appearance {
  return {
    theme: value.theme ?? "dark",
    accent: value.accent ?? "#8B9FFF",
    cardDensity: value.cardDensity ?? "comfortable",
    glassEnabled: value.glassEnabled ?? true,
    themePreset: value.themePreset ?? "future-glass",
    customTheme: value.customTheme ?? null,
    customCSS: value.customCSS ?? "",
  };
}
export function appearanceChoice(value: Appearance): PersonalAppearance {
  return {
    themePreset: value.themePreset ?? "future-glass",
    customTheme: value.customTheme ?? null,
    customCSS: value.customCSS ?? "",
  };
}
export function readThemeLibrary(): ThemeLibraryEntry[] {
  try {
    const source = preference("nexa.themes");
    if (!source || source.length > 180000) return [];
    const value: unknown = JSON.parse(source);
    if (!Array.isArray(value) || value.length > 10) return [];
    const ids = new Set<string>();
    for (const entry of value as ThemeLibraryEntry[]) {
      if (
        !entry ||
        typeof entry !== "object" ||
        Object.keys(entry).length !== 2 ||
        typeof entry.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          entry.id,
        ) ||
        ids.has(entry.id) ||
        !window.NexaTheme.validTheme(entry.theme)
      )
        return [];
      ids.add(entry.id);
    }
    return value as ThemeLibraryEntry[];
  } catch {
    return [];
  }
}

export function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
export async function readThemeFile(
  file: File,
  kind: "json" | "css",
): Promise<string> {
  if (file.size > (kind === "json" ? 16384 : 65536))
    throw new Error("Invalid theme file");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await file.arrayBuffer(),
  );
}
