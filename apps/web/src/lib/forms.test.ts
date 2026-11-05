import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { characters, safeNext, serviceErrors, serviceInput, useDraft, validPassword, validURL } from './forms';
import { fixtureServices } from '@/test/fixtures';
import { iconNames, iconRegistry } from './icons';
import { en } from '@/locales/en';
import { zhHant } from '@/locales/zh-Hant';
import { detectLocale } from '@/app/preferences';

describe('validation trust boundaries', () => {
  it.each(['https://photos.example.com', 'http://192.168.1.10:5000', 'http://localhost:8080', 'http://[fd00::1]:8080', 'https://例子.台灣/相片'])('allows a stored link without fetching %s', (url) => expect(validURL(url)).toBe(true));
  it.each(['javascript:alert(1)', 'data:text/html,hello', '//example.com', 'https://user:pass@example.com', 'http://@example.com', 'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://0177.0.0.1', 'https://example.com:0', 'https://example.com:65536', 'https://example.com:', 'https://example.com/%0d%0a', 'https://example.com/%5c', 'https://example.com/%C2%85', 'https://example.com/\r\n', 'https://example.com\\evil', 'http://[fe80::1%25eth0]', ' https://example.com'])('rejects unsafe or ambiguous %s', (url) => expect(validURL(url)).toBe(false));
  it('counts Unicode characters rather than UTF-16 code units', () => {
    expect(characters('🏠'.repeat(80))).toBe(80);expect(validPassword('密碼'.repeat(6))).toBe(true);
    const input = serviceInput();input.name = '🏠'.repeat(80);input.links[0]!.url = 'https://example.test';
    expect(serviceErrors(input)).toEqual({});input.name += 'a';expect(serviceErrors(input).name).toBe('invalidName');
  });
  it('strips response-only fields from replacement bodies', () => {
    const input = serviceInput(fixtureServices(1)[0]);
    expect(input).not.toHaveProperty('id');expect(input).not.toHaveProperty('position');expect(input.links[0]).not.toHaveProperty('id');
  });
  it('bounds local redirects', () => {
    for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/login', '/setup', 'javascript:alert(1)']) expect(safeNext(value)).toBe('/admin');
    expect(safeNext('/')).toBe('/');expect(safeNext('/admin/services/new')).toBe('/admin/services/new');
  });
  it('retains drafts on server refresh and resets to the new source explicitly', () => {
    const { result, rerender } = renderHook(({ source }) => useDraft(source), { initialProps: { source: { value: 'old', revision: 1 } } });
    act(() => result.current.update({ value: 'draft', revision: 1 }));rerender({ source: { value: 'server', revision: 2 } });
    expect(result.current.value.value).toBe('draft');expect(result.current.dirty).toBe(true);
    act(() => result.current.reset());expect(result.current.value).toEqual({ value: 'server', revision: 2 });
  });
});

it('keeps every registry icon and locale key aligned', () => {
  expect(Object.keys(iconRegistry).sort()).toEqual([...iconNames].sort());expect(Object.keys(zhHant).sort()).toEqual(Object.keys(en).sort());
  expect(detectLocale(['en-US'])).toBe('en');expect(detectLocale(['zh-TW'])).toBe('zh-Hant');expect(detectLocale(['fr-FR'])).toBe('fr');
});

it('computes AA foreground and readable accent colors in both themes', () => {
  for (let red = 0; red <= 255; red += 51) for (let green = 0; green <= 255; green += 51) for (let blue = 0; blue <= 255; blue += 51) {
    const color = '#' + [red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('');
    expect(window.NexaTheme.contrast(color, window.NexaTheme.foreground(color))).toBeGreaterThanOrEqual(4.5);
    for (const [mode, background] of [['dark', '#182338'], ['light', '#eef2fb']] as const) expect(window.NexaTheme.contrast(window.NexaTheme.readableAccent(color, background, mode), background)).toBeGreaterThanOrEqual(4.5);
  }
  localStorage.setItem('nexa.appearance', 'null');expect(window.NexaTheme.readAppearance()).toEqual({});
  expect(window.NexaTheme.apply({ theme: 'light', glassEnabled: false, cardDensity: 'compact' }, null)).toBe('light');
  expect(document.documentElement.dataset.glass).toBe('false');expect(document.documentElement.dataset.density).toBe('compact');
});
