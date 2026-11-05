import { ar } from "./ar";
import { de } from "./de";
import { en, type MessageKey } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { hi } from "./hi";
import { ja } from "./ja";
import { ko } from "./ko";
import { ptBR } from "./pt-BR";
import { ru } from "./ru";
import { zhHant } from "./zh-Hant";
import { zhHans } from "./zh-Hans";

export const localeRegistry = {
  "zh-Hant": { nativeName: "繁體中文", direction: "ltr", messages: zhHant },
  "zh-Hans": { nativeName: "简体中文", direction: "ltr", messages: zhHans },
  en: { nativeName: "English", direction: "ltr", messages: en },
  ja: { nativeName: "日本語", direction: "ltr", messages: ja },
  ko: { nativeName: "한국어", direction: "ltr", messages: ko },
  es: { nativeName: "Español", direction: "ltr", messages: es },
  fr: { nativeName: "Français", direction: "ltr", messages: fr },
  de: { nativeName: "Deutsch", direction: "ltr", messages: de },
  "pt-BR": {
    nativeName: "Português (Brasil)",
    direction: "ltr",
    messages: ptBR,
  },
  ru: { nativeName: "Русский", direction: "ltr", messages: ru },
  ar: { nativeName: "العربية", direction: "rtl", messages: ar },
  hi: { nativeName: "हिन्दी", direction: "ltr", messages: hi },
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
