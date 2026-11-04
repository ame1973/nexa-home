import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Settings } from '@/lib/api/client';
import { en, type MessageKey } from '@/locales/en';
import { zhHant } from '@/locales/zh-Hant';

export type Locale = 'en' | 'zh-Hant';
type ThemeChoice = 'dark' | 'light' | 'system' | null;
type Appearance = Partial<Pick<Settings, 'theme' | 'accent' | 'cardDensity' | 'glassEnabled'>>;
const preference = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const persist = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Preferences are optional when browser storage is unavailable. */ } };
export function detectLocale(languages = navigator.languages): Locale {
  const supported = languages.find((language) => /^(en|zh)(-|$)/i.test(language));
  return supported?.toLowerCase().startsWith('en') ? 'en' : 'zh-Hant';
}
const media = () => matchMedia('(prefers-color-scheme: dark)');
const subscribeSystem = (notify: () => void) => { const query = media(); query.addEventListener('change', notify); return () => query.removeEventListener('change', notify); };
const Preferences = createContext<{
  locale: Locale; setLocale(value: Locale): void;
  theme: ThemeChoice; setTheme(value: ThemeChoice): void;
  resolvedTheme: 'light' | 'dark';
} | null>(null);

export function PreferencesProvider({ children, appearance }: { children: ReactNode; appearance?: Appearance }) {
  const [locale, setLocaleState] = useState<Locale>(() => { const saved = preference('nexa.locale'); return saved === 'en' || saved === 'zh-Hant' ? saved : detectLocale(); });
  const [theme, setThemeState] = useState<ThemeChoice>(() => { const saved = preference('nexa.theme'); return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : null; });
  const systemDark = useSyncExternalStore(subscribeSystem, () => media().matches, () => true);
  const global = useMemo(() => appearance ?? window.NexaTheme.readAppearance(), [appearance]);
  const shared = global.theme === 'light' || global.theme === 'system' ? global.theme : 'dark';
  const choice = theme ?? shared;
  const resolvedTheme = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
  useEffect(() => {
    window.NexaTheme.apply(global, theme);
    if (appearance) persist('nexa.appearance', JSON.stringify({ theme: appearance.theme, accent: appearance.accent, cardDensity: appearance.cardDensity, glassEnabled: appearance.glassEnabled }));
  }, [global, appearance, theme, systemDark]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <Preferences value={{ locale, theme, resolvedTheme, setLocale(value) { persist('nexa.locale', value); setLocaleState(value); }, setTheme(value) { persist('nexa.theme', value); setThemeState(value); } }}>{children}</Preferences>;
}

export function usePreferences() {
  const value = useContext(Preferences);
  if (!value) throw new Error('PreferencesProvider is required');
  return value;
}
export function useI18n() {
  const { locale } = usePreferences();
  return {
    locale,
    t(key: MessageKey, values: Record<string, string | number> = {}) {
      const template = (locale === 'en' ? en : zhHant)[key];
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
    },
  };
}
