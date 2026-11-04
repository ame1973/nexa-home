// A blocking, same-origin bootstrap applies only presentation preferences before paint.
// Never persist names, URLs, authentication tokens or backup contents here.
(function () {
  const root = document.documentElement;
  const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const rgb = (value) => [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const luminance = (value) => rgb(value).map((byte) => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const foreground = (background) => contrast(background, '#000000') >= contrast(background, '#ffffff') ? '#000000' : '#ffffff';
  const readableAccent = (accent, background, theme) => {
    if (contrast(accent, background) >= 4.5) return accent;
    const source = rgb(accent);
    const target = theme === 'light' ? 0 : 255;
    for (let step = 1; step <= 20; step++) {
      const color = '#' + source.map((channel) => Math.round(channel + (target - channel) * step / 20).toString(16).padStart(2, '0')).join('');
      if (contrast(color, background) >= 4.5) return color;
    }
    return target ? '#ffffff' : '#000000';
  };
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const readAppearance = () => {
    try { const value = JSON.parse(read('nexa.appearance') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
  };
  const apply = (appearance, override) => {
    const preference = ['dark', 'light', 'system'].includes(override) ? override : ['dark', 'light', 'system'].includes(appearance?.theme) ? appearance.theme : 'dark';
    const theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.glass = appearance?.glassEnabled === false ? 'false' : 'true';
    root.dataset.density = appearance?.cardDensity === 'compact' ? 'compact' : 'comfortable';
    let accent = isHex(appearance?.accent) ? appearance.accent : theme === 'light' ? '#5369d7' : '#8b9fff';
    if (accent.toLowerCase() === '#8b9fff' && theme === 'light') accent = '#5369d7';
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-ink', readableAccent(accent, theme === 'light' ? '#eef2fb' : '#182338', theme));
    root.style.setProperty('--primary-foreground', foreground(accent));
    return theme;
  };
  window.NexaTheme = { apply, foreground, contrast, readableAccent, readAppearance };
  apply(readAppearance(), read('nexa.theme'));
})();
