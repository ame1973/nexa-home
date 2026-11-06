/// <reference types="vite/client" />

interface Window {
  __webpack_nonce__?: string;
  NexaTheme: {
    presets: import("./lib/themes").BuiltinPreset[];
    safeMode: boolean;
    apply(
      appearance: import("./lib/themes").Appearance,
      override?: string | null,
      personal?: import("./lib/themes").PersonalAppearance | null,
    ): "dark" | "light";
    tokens(
      appearance: import("./lib/themes").Appearance,
      mode: "dark" | "light",
    ): Record<string, string>;
    definition(
      preset: string,
      name: string,
    ): import("./lib/themes").CustomTheme;
    validTheme(value: unknown): value is import("./lib/themes").CustomTheme;
    validCSS(value: unknown): value is string;
    validPersonal(
      value: unknown,
    ): value is import("./lib/themes").PersonalAppearance;
    parseTheme(source: string): import("./lib/themes").CustomTheme;
    foreground(color: string): string;
    contrast(a: string, b: string): number;
    readableAccent(accent: string, background: string, theme?: string): string;
    readAppearance(): import("./lib/themes").Appearance;
    readPersonal(): import("./lib/themes").PersonalAppearance | null;
  };
}
