import { useState } from 'react';
import type { Service, ServiceInput, Settings, SettingsInput } from './api/client';
import type { MessageKey } from '@/locales/en';
import { appearanceChoice } from './themes';

export type FieldErrors = Record<string, MessageKey>;
export const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
export const characters = (value: string) => Array.from(value).length;
export const validText = (value: string, min: number, max: number) => characters(value) >= min && characters(value) <= max && (min === 0 || value.trim().length > 0) && !/\p{Cc}/u.test(value);
export const validPassword = (value: string) => characters(value) >= 12 && characters(value) <= 128;

export function validURL(value: string): boolean {
  if (value.length < 8 || new TextEncoder().encode(value).length > 2048 || value !== value.trim() || /[\\\p{Cc}]/u.test(value) || /%(?![0-9a-f]{2})/i.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)|%c2%[89][0-9a-f]/i.test(value)) return false;
  try {
    const parsed = new URL(value);
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
    if (!authority || authority.includes('@') || authority.endsWith(':') || !['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || (parsed.port !== '' && (Number(parsed.port) < 1 || Number(parsed.port) > 65535))) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      const rawHost = authority.replace(/:\d+$/, '');
      if (rawHost !== parsed.hostname) return false;
    }
    return !parsed.hostname.includes('%');
  } catch { return false; }
}

export function safeNext(value: string | null): string {
  if (!value || value.includes('\\') || value.startsWith('//')) return '/admin';
  const path = value.split(/[?#]/)[0];
  return path === '/' || path === '/admin' || path?.startsWith('/admin/') ? value : '/admin';
}

export function serviceInput(service?: Service): ServiceInput {
  if (!service) return { name: '', description: '', categoryId: null, iconKind: 'lucide', iconValue: 'app-window', iconAssetId: null, color: '#405B82', openMode: 'new_tab', isFavorite: false, isVisible: true, tagIds: [], links: [{ label: 'primary', url: '' }] };
  return {
    name: service.name, description: service.description, categoryId: service.categoryId, iconKind: service.iconKind,
    iconValue: service.iconValue, iconAssetId: service.iconAssetId, color: service.color, openMode: service.openMode,
    isFavorite: service.isFavorite, isVisible: service.isVisible, tagIds: [...service.tagIds],
    links: service.links.map(({ label, url }) => ({ label, url })),
  };
}
export function settingsInput(settings: Settings): SettingsInput {
  return { siteTitle: settings.siteTitle, siteSubtitle: settings.siteSubtitle, accessMode: settings.accessMode, theme: settings.theme, accent: settings.accent, cardDensity: settings.cardDensity, glassEnabled: settings.glassEnabled, ...appearanceChoice(settings), expectedRevision: settings.revision };
}
export function serviceErrors(value: ServiceInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!validText(value.name, 1, 80)) errors.name = 'invalidName';
  if (!validText(value.description, 0, 240)) errors.description = 'invalidText';
  if (!isColor(value.color)) errors.color = 'invalidColor';
  if (value.tagIds.length > 20) errors.tagIds = 'tagHint';
  if (value.iconKind !== 'lucide' && !value.iconAssetId) errors.iconAssetId = 'invalidField';
  for (const label of ['primary', 'lan', 'wan'] as const) {
    const link = value.links.find((link) => link.label === label);
    if ((label === 'primary' || link) && (!link || !validURL(link.url))) errors[label] = 'invalidUrl';
  }
  return errors;
}

// A draft captures its original revision on the first edit. Background query
// refreshes update pristine forms but never overwrite unsaved input.
export function useDraft<T>(source: T) {
  const [draft, setDraft] = useState<{ value: T; baseline: T } | null>(null);
  return {
    value: draft?.value ?? source,
    dirty: draft !== null,
    update(value: T) {
      const baseline = draft?.baseline ?? source;
      setDraft(JSON.stringify(value) === JSON.stringify(baseline) ? null : { value, baseline });
    },
    reset() { setDraft(null); },
  };
}
