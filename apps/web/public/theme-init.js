// Apply presentation preferences before paint; never cache catalog or credentials.
(function () {
  const root = document.documentElement;
  const nonce = document.querySelector('meta[name="nexa-style-nonce"]')?.getAttribute('content');
  if (nonce && /^[A-Za-z0-9+/]{43}=$/.test(nonce)) window.__webpack_nonce__ = nonce;
  // Latch recovery for this document, even when an internal link drops the query.
  const safeMode = new URLSearchParams(location.search).get('appearance') === 'safe';
  const presets = ['future-glass', 'graphite', 'tide', 'forest', 'dune'];
  // background, surface, elevated, text, secondary text, accent, control border.
  const palettes = {
    'future-glass': {
      dark: ['#090e1a', '#111a2a', '#182338', '#f3f6ff', '#a5b1c7', '#8b9fff', '#71809b'],
      light: ['#f5f7fc', '#ffffff', '#eef2fb', '#182033', '#536078', '#5369d7', '#66748d'],
    },
    graphite: {
      dark: ['#121518', '#1c2025', '#272d34', '#f4f5f7', '#b2bcc8', '#c2ccdc', '#748295'],
      light: ['#f4f5f6', '#ffffff', '#e9edf1', '#1b222b', '#535e6c', '#344154', '#65717e'],
    },
    tide: {
      dark: ['#0c1b22', '#132d38', '#1b3a46', '#eaf6f8', '#abc5cd', '#6bd3cc', '#7195a2'],
      light: ['#f0f7f8', '#ffffff', '#e2eff1', '#15333d', '#486671', '#006c73', '#557d86'],
    },
    forest: {
      dark: ['#132019', '#1b3024', '#26402f', '#f0f6ee', '#b4c9b2', '#a2d49f', '#7e9b7e'],
      light: ['#f2f6ef', '#fcfefa', '#e7eee1', '#1c3223', '#4c6650', '#34633f', '#688264'],
    },
    dune: {
      dark: ['#201d18', '#2c2821', '#3a342a', '#faf3e8', '#c9baa4', '#e3bf7f', '#9b8a6e'],
      light: ['#f8f5ef', '#fffdfa', '#f0e8d9', '#392f23', '#6d5c46', '#865c22', '#8c7758'],
    },
  };
  const materials = {
    'future-glass': [16, 'soft', .75, 14, .13],
    graphite: [12, 'none', 1, 0, 0],
    tide: [16, 'soft', .92, 10, .06],
    forest: [12, 'none', .96, 6, .03],
    dune: [20, 'soft', 1, 0, 0],
    custom: [16, 'soft', 1, 0, 0],
  };
  const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const rgb = (value) => [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const hex = (channels) => '#' + channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');
  const mix = (first, second, amount) => hex(rgb(first).map((channel, i) => channel + (rgb(second)[i] - channel) * amount));
  const luminance = (value) => rgb(value).map((byte) => {
    const channel = byte / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  const minimum = (color, backgrounds) => Math.min(...backgrounds.map((background) => contrast(color, background)));
  const ink = (backgrounds) => minimum('#000000', backgrounds) >= minimum('#ffffff', backgrounds) ? '#000000' : '#ffffff';
  const foreground = (background) => ink([background]);
  const readable = (color, backgrounds, ratio) => {
    if (minimum(color, backgrounds) >= ratio) return color;
    const target = ink(backgrounds);
    for (let step = 1; step <= 100; step++) {
      const candidate = mix(color, target, step / 100);
      if (minimum(candidate, backgrounds) >= ratio) return candidate;
    }
    return target;
  };
  const readableAccent = (accent, background) => readable(accent, [background], 4.5);
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keys = (value, names) => object(value) && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
  const bytes = (value) => new TextEncoder().encode(value).length;
  const validTheme = (value) => {
    if (!keys(value, ['schemaVersion', 'name', 'variants', 'radius', 'shadow']) || value.schemaVersion !== 1 || typeof value.name !== 'string' || !value.name.isWellFormed() || !value.name.trim() || [...value.name].length > 80 || /\p{Cc}/u.test(value.name) || ![8, 12, 16, 20].includes(value.radius) || !['none', 'soft'].includes(value.shadow) || !keys(value.variants, ['light', 'dark'])) return false;
    for (const mode of ['light', 'dark']) {
      const palette = value.variants[mode];
      if (!keys(palette, ['background', 'surface', 'accent']) || !Object.values(palette).every(isHex)) return false;
      if (minimum(ink([palette.background, palette.surface]), [palette.background, palette.surface]) < 4.5) return false;
    }
    return bytes(JSON.stringify(value)) <= 16384;
  };
  const validCSS = (value) => typeof value === 'string' && !value.includes('\0') && value.isWellFormed() && bytes(value) <= 65536;
  const validPersonal = (value) => keys(value, ['themePreset', 'customTheme', 'customCSS']) && [...presets, 'custom'].includes(value.themePreset) && (value.customTheme === null || validTheme(value.customTheme)) && (value.themePreset !== 'custom' || validTheme(value.customTheme)) && validCSS(value.customCSS);
  const parseTheme = (source) => {
    if (typeof source !== 'string' || bytes(source) > 16384) throw new Error('Invalid theme');
    const value = JSON.parse(source);
    // Native JSON handles syntax; retain duplicate-key evidence before accepting it.
    const stack = [];
    for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/g)) {
      const token = match[0];
      if (token === '{' || token === '[') {
        stack.push(token === '{' ? new Set() : null);
        if (stack.length > 64) throw new Error('Invalid theme');
      } else if (token === '}' || token === ']') stack.pop();
      else if (/^\s*:/.test(source.slice(match.index + token.length))) {
        const key = JSON.parse(token);
        const names = stack.at(-1);
        if (names?.has(key)) throw new Error('Duplicate theme key');
        names?.add(key);
      }
    }
    if (!validTheme(value)) throw new Error('Invalid theme');
    return value;
  };
  const definition = (preset, name) => {
    const id = presets.includes(preset) ? preset : 'future-glass';
    const variant = (mode) => ({ background: palettes[id][mode][0], surface: palettes[id][mode][1], accent: palettes[id][mode][5] });
    return { schemaVersion: 1, name, variants: { light: variant('light'), dark: variant('dark') }, radius: materials[id][0], shadow: materials[id][1] };
  };
  const tokens = (appearance, mode) => {
    const custom = appearance?.themePreset === 'custom' && validTheme(appearance?.customTheme) ? appearance.customTheme : null;
    const id = custom ? 'custom' : presets.includes(appearance?.themePreset) ? appearance.themePreset : 'future-glass';
    let colors;
    if (custom) {
      const variant = custom.variants[mode];
      const backgrounds = [variant.background, variant.surface];
      const text = ink(backgrounds);
      const elevated = mix(variant.surface, text === '#000000' ? '#ffffff' : '#000000', .04);
      backgrounds.push(elevated);
      colors = [variant.background, variant.surface, elevated, text, readable(mix(variant.surface, text, .7), backgrounds, 4.5), variant.accent, readable(mix(variant.surface, text, .5), backgrounds, 3)];
    } else colors = [...palettes[id][mode]];
    let [background, surface, elevated, text, secondary, accent, control] = colors;
    if (id === 'future-glass' && isHex(appearance?.accent)) {
      accent = appearance.accent;
      if (accent.toLowerCase() === '#8b9fff' && mode === 'light') accent = palettes[id].light[5];
    }
    const backgrounds = [background, surface, elevated];
    const [radius, shadow, opacity, blur, glow] = materials[id];
    return {
      '--bg': background, '--surface': surface, '--surface-elevated': elevated,
      '--text-primary': text, '--text-secondary': secondary,
      '--border': mix(surface, text, mode === 'light' ? .14 : .18), '--control-border': control,
      '--accent': accent, '--accent-ink': readable(accent, backgrounds, 4.5), '--primary-foreground': foreground(accent),
      '--danger': readable(mode === 'light' ? '#ba304a' : '#ff7185', backgrounds, 4.5), '--focus': readable(accent, backgrounds, 3),
      '--glass-surface': `rgb(${rgb(surface).join(' ')} / ${mode === 'light' ? Math.max(opacity, .88) : opacity})`, '--glass-blur': `${blur}px`, '--glow': String(glow),
      '--overlay': mode === 'light' ? 'rgb(24 32 51 / 44%)' : 'rgb(4 8 15 / 64%)',
      '--radius': `${custom?.radius ?? radius}px`,
      '--shadow': (custom?.shadow ?? shadow) === 'none' ? 'none' : mode === 'light' ? '0 12px 40px rgb(24 32 51 / 7%)' : '0 12px 40px rgb(0 0 0 / 12%)',
    };
  };
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const readJSON = (key) => {
    try {
      const source = read(key);
      return source && source.length <= 524288 ? JSON.parse(source) : null;
    } catch { return null; }
  };
  const readAppearance = () => {
    const stored = readJSON('nexa.appearance');
    if (!object(stored)) return {};
    const value = {};
    for (const key of ['theme', 'accent', 'cardDensity', 'glassEnabled', 'themePreset', 'customTheme', 'customCSS']) {
      if (Object.hasOwn(stored, key)) value[key] = stored[key];
    }
    return value;
  };
  const readPersonal = () => {
    const value = readJSON('nexa.personalAppearance');
    return validPersonal(value) ? value : null;
  };
  const apply = (appearance, override, personal) => {
    let effective = validPersonal(personal) ? { ...appearance, ...personal, accent: undefined } : appearance;
    if (safeMode) effective = { ...effective, themePreset: 'future-glass', customTheme: null, customCSS: '', accent: undefined, glassEnabled: false, cardDensity: 'comfortable' };
    const preference = ['dark', 'light', 'system'].includes(override) ? override : ['dark', 'light', 'system'].includes(effective?.theme) ? effective.theme : 'dark';
    const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
    root.dataset.theme = theme;
    root.dataset.themePreset = effective?.themePreset === 'custom' && validTheme(effective?.customTheme) ? 'custom' : presets.includes(effective?.themePreset) ? effective.themePreset : 'future-glass';
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.glass = effective?.glassEnabled === false ? 'false' : 'true';
    root.dataset.density = effective?.cardDensity === 'compact' ? 'compact' : 'comfortable';
    root.dataset.safeAppearance = String(safeMode);
    for (const [name, value] of Object.entries(tokens(effective, theme))) root.style.setProperty(name, value);
    const css = validCSS(effective?.customCSS) ? effective.customCSS : '';
    let style = document.getElementById('nexa-custom-css');
    if (!css) style?.remove();
    else {
      if (!style) {
        style = document.createElement('style');
        style.id = 'nexa-custom-css';
        if (window.__webpack_nonce__) style.nonce = window.__webpack_nonce__;
      }
      if (style.textContent !== css) style.textContent = css;
      // Keep user rules after the compiled stylesheet, including after hydration.
      document.head.append(style);
    }
    return theme;
  };
  window.NexaTheme = { presets, safeMode, apply, tokens, definition, validTheme, validCSS, validPersonal, parseTheme, foreground, contrast, readableAccent, readAppearance, readPersonal };
  apply(readAppearance(), read('nexa.theme'), readPersonal());
})();
