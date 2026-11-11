import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "./en";
import { detectLocale, isLocale, localeRegistry, type Locale } from "./index";
import {
  PreferencesProvider,
  useI18n,
  usePreferences,
} from "@/app/preferences";

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const numbers = (message: string) => message.match(/#[0-9a-f]{6}|\d+/gi) || [];
const wrapper = ({ children }: { children: ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe("complete locale dictionaries", () => {
  it("registers all twelve supported interface locales", () => {
    expect(Object.keys(localeRegistry)).toEqual([
      "zh-Hant",
      "zh-Hans",
      "en",
      "ja",
      "ko",
      "es",
      "fr",
      "de",
      "pt-BR",
      "ru",
      "ar",
      "hi",
    ]);
  });
  it.each(Object.entries(localeRegistry))(
    "%s keeps every key, placeholder and numeric safety limit",
    (code, definition) => {
      expect(Object.keys(definition.messages).sort()).toEqual(
        Object.keys(en).sort(),
      );
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const message = definition.messages[key];
        expect(message.trim(), key).not.toBe("");
        expect(placeholders(message), key).toEqual(placeholders(en[key]));
        if (key === "invalidColor") expect(message, key).toContain("#405B82");
        else if (numbers(en[key]).length)
          expect(numbers(message), key).toEqual(numbers(en[key]));
        if (definition.direction === "rtl") {
          for (const [range] of message.matchAll(/\d+–\d+|\d+ MiB/g))
            expect(message, key).toContain(`\u{2066}${range}\u{2069}`);
        }
      }
      if (code !== "en") {
        for (const key of [
          "search",
          "save",
          "restoreDescription",
          "passwordWarning",
        ] as const)
          expect(definition.messages[key], key).not.toBe(en[key]);
      }
    },
  );
  it.each(Object.entries(localeRegistry))(
    "%s advertises JPG/JPEG icon uploads",
    (_code, definition) => {
      expect(definition.messages.uploadHint).toContain("JPG/JPEG");
    },
  );
  it.each([
    null,
    undefined,
    "",
    "constructor",
    "__proto__",
    "en-US",
    "zz-ZZ",
    42,
  ])("rejects an unsupported stored locale %s", (value) => {
    expect(isLocale(value)).toBe(false);
  });
});

it.each([
  ["en-US", "en"],
  ["en-GB-u-ca-gregory", "en"],
  ["zh", "zh-Hans"],
  ["zh-CN", "zh-Hans"],
  ["zh-SG", "zh-Hans"],
  ["zh-MY", "zh-Hans"],
  ["zh-TW", "zh-Hant"],
  ["zh-HK", "zh-Hant"],
  ["zh-MO", "zh-Hant"],
  ["zh-Hant-CN", "zh-Hant"],
  ["zh-Hans-TW", "zh-Hans"],
  ["ZH-hAnT-tw", "zh-Hant"],
  ["ja-JP", "ja"],
  ["ko-KR", "ko"],
  ["es-ES", "es"],
  ["es-MX", "es"],
  ["fr-FR", "fr"],
  ["fr-CA", "fr"],
  ["de-DE", "de"],
  ["de-CH", "de"],
  ["pt", "pt-BR"],
  ["pt-BR", "pt-BR"],
  ["pt-PT", "pt-BR"],
  ["ru-RU", "ru"],
  ["ar-SA", "ar"],
  ["ar-EG", "ar"],
  ["hi-IN", "hi"],
])("detects browser language %s as %s", (language, expected) => {
  expect(detectLocale([language])).toBe(expected);
});

it("honors preference order, skips malformed tags and retains the Traditional Chinese fallback", () => {
  expect(detectLocale(["zz-ZZ", "en-GB", "zh-CN"])).toBe("en");
  expect(detectLocale(["invalid_tag", "fr-CA", "en-US"])).toBe("fr");
  expect(detectLocale(["zz-ZZ", "ar-EG", "hi-IN"])).toBe("ar");
  expect(detectLocale(["invalid_tag", "zh-TW"])).toBe("zh-Hant");
  expect(detectLocale(["", "*", "zz-ZZ"])).toBe("zh-Hant");
  expect(detectLocale([])).toBe("zh-Hant");
});

it("applies a saved locale, interpolates messages and persists an immediate switch across remounts", () => {
  localStorage.setItem("nexa.locale", "zh-Hans");
  const first = renderHook(
    () => ({ preferences: usePreferences(), i18n: useI18n() }),
    { wrapper },
  );
  expect(first.result.current.i18n.t("search")).toBe("搜索");
  expect(first.result.current.i18n.t("page", { page: 2, total: 3 })).toBe(
    "第 2 页，共 3 页",
  );
  expect(document.documentElement.lang).toBe("zh-Hans");
  expect(document.documentElement.dir).toBe("ltr");
  act(() => first.result.current.preferences.setLocale("en"));
  expect(first.result.current.i18n.t("search")).toBe("Search");
  expect(localStorage.getItem("nexa.locale")).toBe("en");
  first.unmount();
  const second = renderHook(usePreferences, { wrapper });
  expect(second.result.current.locale).toBe("en");
});

it.each(Object.keys(localeRegistry) as Locale[])(
  "persists %s across remounts with its document direction and translated messages",
  (locale) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["zz-ZZ"]);
    const first = renderHook(
      () => ({ preferences: usePreferences(), i18n: useI18n() }),
      { wrapper },
    );
    act(() => first.result.current.preferences.setLocale(locale));
    expect(first.result.current.i18n.t("search")).toBe(
      localeRegistry[locale].messages.search,
    );
    expect(
      first.result.current.i18n.t("selectIcon", { name: "NAS الصور" }),
    ).toBe(
      localeRegistry[locale].messages.selectIcon.replace("{name}", "NAS الصور"),
    );
    expect(localStorage.getItem("nexa.locale")).toBe(locale);
    expect(document.documentElement.lang).toBe(locale);
    expect(document.documentElement.dir).toBe(localeRegistry[locale].direction);
    first.unmount();
    const second = renderHook(usePreferences, { wrapper });
    expect(second.result.current.locale).toBe(locale);
  },
);

it("restores left-to-right layout immediately after leaving Arabic", () => {
  localStorage.setItem("nexa.locale", "ar");
  const { result } = renderHook(usePreferences, { wrapper });
  expect(result.current.direction).toBe("rtl");
  expect(document.documentElement.dir).toBe("rtl");
  act(() => result.current.setLocale("hi"));
  expect(result.current.direction).toBe("ltr");
  expect(document.documentElement.dir).toBe("ltr");
  expect(document.documentElement.lang).toBe("hi");
});

it("ignores an invalid saved locale and detects the browser instead", () => {
  localStorage.setItem("nexa.locale", "constructor");
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["zh-CN"]);
  const { result } = renderHook(usePreferences, { wrapper });
  expect(result.current.locale).toBe("zh-Hans");
});

it("still switches language when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage is unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage is unavailable");
  });
  const { result } = renderHook(usePreferences, { wrapper });
  act(() => result.current.setLocale("zh-Hans"));
  expect(result.current.locale).toBe("zh-Hans");
  expect(document.documentElement.lang).toBe("zh-Hans");
});
