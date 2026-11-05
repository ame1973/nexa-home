/// <reference types="vite/client" />

interface Window {
  __webpack_nonce__?: string;
  NexaTheme: {
    apply(appearance: { theme?: string; accent?: string; cardDensity?: string; glassEnabled?: boolean }, override?: string | null): 'dark' | 'light';
    foreground(color: string): string;
    contrast(a: string, b: string): number;
    readableAccent(accent: string, background: string, theme: string): string;
    readAppearance(): { theme?: string; accent?: string; cardDensity?: string; glassEnabled?: boolean };
  };
}
