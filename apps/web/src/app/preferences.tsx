import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Direction } from "radix-ui";
import {
  appearanceFields,
  persist,
  preference,
  readThemeLibrary,
  type Appearance,
  type PersonalAppearance,
  type ThemeChoice,
  type ThemeLibraryEntry,
} from "@/lib/themes";
import type { MessageKey } from "@/locales/en";
import { detectLocale, isLocale, localeRegistry, type Locale } from "@/locales";

export { detectLocale } from "@/locales";
export type { Locale } from "@/locales";
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
  sharedAppearance: Appearance;
  personal: PersonalAppearance | null;
  setPersonal(value: PersonalAppearance | null): boolean;
  library: ThemeLibraryEntry[];
  setLibrary(value: ThemeLibraryEntry[]): boolean;
  preview: Appearance | null;
  setPreview(value: Appearance | null): void;
  safeMode: boolean;
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
  const [personal, setPersonalState] = useState(window.NexaTheme.readPersonal);
  const [library, setLibraryState] = useState(readThemeLibrary);
  const [preview, setPreview] = useState<Appearance | null>(null);
  const setPersonal = useCallback((value: PersonalAppearance | null) => {
    if (value !== null && !window.NexaTheme.validPersonal(value)) return false;
    if (
      !persist(
        "nexa.personalAppearance",
        value === null ? null : JSON.stringify(value),
      )
    )
      return false;
    setPersonalState(value);
    return true;
  }, []);
  const setLibrary = useCallback((value: ThemeLibraryEntry[]) => {
    if (
      value.length > 10 ||
      value.some((entry) => !window.NexaTheme.validTheme(entry.theme))
    )
      return false;
    if (!persist("nexa.themes", JSON.stringify(value))) return false;
    setLibraryState(value);
    return true;
  }, []);
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => media().matches,
    () => true,
  );
  const global = useMemo(
    () => appearance ?? window.NexaTheme.readAppearance(),
    [appearance],
  );
  const current = preview ?? global;
  const shared =
    current.theme === "light" || current.theme === "system"
      ? current.theme
      : "dark";
  const choice = (preview ? null : theme) ?? shared;
  const resolvedTheme =
    choice === "system" ? (systemDark ? "dark" : "light") : choice;
  const direction = localeRegistry[locale].direction;
  useLayoutEffect(() => {
    window.NexaTheme.apply(
      preview ?? global,
      preview ? null : theme,
      preview ? null : personal,
    );
  }, [global, theme, personal, preview, systemDark]);
  useEffect(() => {
    if (appearance)
      persist("nexa.appearance", JSON.stringify(appearanceFields(appearance)));
  }, [appearance]);
  useEffect(() => {
    if (!preview) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [preview]);
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
          sharedAppearance: global,
          personal,
          setPersonal,
          library,
          setLibrary,
          preview,
          setPreview,
          safeMode: window.NexaTheme.safeMode,
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
