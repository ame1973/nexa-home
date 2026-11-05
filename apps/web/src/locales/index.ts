import { en, type MessageKey } from "./en";
import { zhHant } from "./zh-Hant";
import { zhHans } from "./zh-Hans";

export const localeRegistry = {
  "zh-Hant": { nativeName: "繁體中文", direction: "ltr", messages: zhHant },
  "zh-Hans": { nativeName: "简体中文", direction: "ltr", messages: zhHans },
  en: { nativeName: "English", direction: "ltr", messages: en },
} as const satisfies Record<
  string,
  {
    nativeName: string;
    direction: "ltr" | "rtl";
    messages: Record<MessageKey, string>;
  }
>;

export type Locale = keyof typeof localeRegistry;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(localeRegistry, value);
}

export function detectLocale(
  languages: readonly string[] = navigator.languages,
): Locale {
  for (const language of languages) {
    try {
      const parsed = new Intl.Locale(language);
      if (parsed.language === "zh")
        return parsed.maximize().script === "Hant" ? "zh-Hant" : "zh-Hans";
      const candidate = parsed.language === "pt" ? "pt-BR" : parsed.language;
      if (isLocale(candidate)) return candidate;
    } catch {
      // Ignore malformed preference tags, never an invalid persisted locale.
    }
  }
  return "zh-Hant";
}
