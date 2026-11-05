import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Direction } from "radix-ui";
import type { Settings } from "@/lib/api/client";
import type { MessageKey } from "@/locales/en";
import { detectLocale, isLocale, localeRegistry, type Locale } from "@/locales";

export { detectLocale } from "@/locales";
export type { Locale } from "@/locales";
type ThemeChoice = "dark" | "light" | "system" | null;
type Appearance = Partial<
  Pick<Settings, "theme" | "accent" | "cardDensity" | "glassEnabled">
>;
const preference = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const persist = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional when browser storage is unavailable. */
  }
};
const media = () => matchMedia("(prefers-color-scheme: dark)");
const subscribeSystem = (notify: () => void) => {
  const query = media();
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const Preferences = createContext<{
  locale: Locale;
  setLocale(value: Locale): void;
  direction: "ltr" | "rtl";
  theme: ThemeChoice;
  setTheme(value: ThemeChoice): void;
  resolvedTheme: "light" | "dark";
} | null>(null);

export function PreferencesProvider({
  children,
  appearance,
}: {
  children: ReactNode;
  appearance?: Appearance;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = preference("nexa.locale");
    return isLocale(saved) ? saved : detectLocale();
  });
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    const saved = preference("nexa.theme");
    return saved === "dark" || saved === "light" || saved === "system"
      ? saved
      : null;
  });
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => media().matches,
    () => true,
  );
  const global = useMemo(
    () => appearance ?? window.NexaTheme.readAppearance(),
    [appearance],
  );
  const shared =
    global.theme === "light" || global.theme === "system"
      ? global.theme
      : "dark";
  const choice = theme ?? shared;
  const resolvedTheme =
    choice === "system" ? (systemDark ? "dark" : "light") : choice;
  const direction = localeRegistry[locale].direction;
  useEffect(() => {
    window.NexaTheme.apply(global, theme);
    if (appearance)
      persist(
        "nexa.appearance",
        JSON.stringify({
          theme: appearance.theme,
          accent: appearance.accent,
          cardDensity: appearance.cardDensity,
          glassEnabled: appearance.glassEnabled,
        }),
      );
  }, [global, appearance, theme, systemDark]);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale, direction]);
  return (
    <Direction.Provider dir={direction}>
      <Preferences
        value={{
          locale,
          direction,
          theme,
          resolvedTheme,
          setLocale(value) {
            persist("nexa.locale", value);
            setLocaleState(value);
          },
          setTheme(value) {
            persist("nexa.theme", value);
            setThemeState(value);
          },
        }}
      >
        {children}
      </Preferences>
    </Direction.Provider>
  );
}

export function usePreferences() {
  const value = useContext(Preferences);
  if (!value) throw new Error("PreferencesProvider is required");
  return value;
}
export function useI18n() {
  const { locale } = usePreferences();
  return {
    locale,
    t(key: MessageKey, values: Record<string, string | number> = {}) {
      const template = localeRegistry[locale].messages[key];
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(values[name] ?? `{${name}}`),
      );
    },
  };
}
