import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "./en";
import { detectLocale, isLocale, localeRegistry } from "./index";
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
  it.each(Object.entries(localeRegistry))(
    "%s keeps every key, placeholder and numeric safety limit",
    (_code, definition) => {
      expect(Object.keys(definition.messages).sort()).toEqual(
        Object.keys(en).sort(),
      );
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        const message = definition.messages[key];
        expect(message.trim(), key).not.toBe("");
        expect(placeholders(message), key).toEqual(placeholders(en[key]));
        if (numbers(en[key]).length)
          expect(numbers(message), key).toEqual(numbers(en[key]));
      }
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
])("detects browser language %s as %s", (language, expected) => {
  expect(detectLocale([language])).toBe(expected);
});

it("honors preference order, skips malformed tags and retains the Traditional Chinese fallback", () => {
  expect(detectLocale(["zz-ZZ", "en-GB", "zh-CN"])).toBe("en");
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
