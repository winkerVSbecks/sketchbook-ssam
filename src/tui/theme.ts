import { TUI_FONT_FAMILY } from './metrics';

export interface TuiTheme {
  /** Desktop / window body background. */
  bg: string;
  /** Body text and frames. */
  fg: string;
  /** Secondary text, inactive frames, grips. */
  dim: string;
  /** Highlights: active toggles, range thumbs, front-window title. */
  accent: string;
  /** Menu bar + window title-row background. */
  chromeBg: string;
  /** Text on `chromeBg`. */
  chromeFg: string;
  /** Selected menu items / pressed buttons. */
  selectionBg: string;
  /** CSS font-family list (size comes from the metrics). */
  font: string;
}

/** Near-black ground, white ink, alpha-dimmed secondaries — the reference sketch's spirit. */
export const fallbackTheme: TuiTheme = {
  bg: '#0b0b0c',
  fg: '#f2f2f2',
  dim: 'rgba(255, 255, 255, 0.4)',
  accent: '#ffffff',
  chromeBg: 'rgba(255, 255, 255, 0.12)',
  chromeFg: '#f2f2f2',
  selectionBg: 'rgba(255, 255, 255, 0.25)',
  font: TUI_FONT_FAMILY,
};

/**
 * `#rgb` / `#rrggbb` (optionally `#rrggbbaa`) → `rgba(...)` with the given alpha.
 * Anything else is returned unchanged, so unusual palette strings still render.
 */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Deterministic mapping from a sketch palette (palette[0] = background, as in
 * `randomPalette()`):
 *   [0] → bg · [1] → fg · [2] → accent · [3] → chromeBg (else accent) ·
 *   dim = fg @ 45 % · chromeFg = bg · selectionBg = accent @ 30 %.
 * Missing entries fall through to `fallbackTheme`.
 */
export function themeFromPalette(palette: readonly string[]): TuiTheme {
  const [bg, fg, accent, chrome] = palette;
  if (!bg) return { ...fallbackTheme };
  const ink = fg ?? fallbackTheme.fg;
  const hi = accent ?? ink;
  const chromeBg = chrome ?? hi;
  return {
    bg,
    fg: ink,
    dim: withAlpha(ink, 0.45),
    accent: hi,
    chromeBg,
    chromeFg: bg,
    selectionBg: withAlpha(hi, 0.3),
    font: TUI_FONT_FAMILY,
  };
}
