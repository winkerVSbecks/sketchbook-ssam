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

type Rgb = readonly [number, number, number];

const clamp255 = (v: number) => Math.round(Math.min(255, Math.max(0, v)));

/** Linear sRGB channel (0–1) → gamma-encoded 0–255. */
const encode = (v: number) => clamp255(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));

/** Oklab (L, a, b) → gamma-encoded sRGB, clipped to the gamut (Björn Ottosson's matrices). */
function oklabToRgb(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Numeric token list from `fn(a b c)` / `fn(a, b, c)`; `%` values are scaled to 0–1. */
function args(body: string): number[] {
  return body
    .split(/[\s,\/]+/)
    .filter(Boolean)
    .map((t) => (t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t)));
}

/**
 * The colour formats the project palettes use — `#rgb` / `#rrggbb` /
 * `#rrggbbaa`, `rgb(r, g, b)`, `oklab(L a b)`, `oklch(L C h)` — → 0–255 sRGB
 * channels. `null` for anything else (named colours, hsl, …).
 */
export function parseColor(color: string): Rgb | null {
  const c = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^(rgba?|oklab|oklch)\((.*)\)$/i.exec(c);
  if (!fn) return null;
  const v = args(fn[2]);
  if (v.length < 3 || v.some((n) => Number.isNaN(n))) return null;
  switch (fn[1].toLowerCase()) {
    case 'rgb':
    case 'rgba':
      return [clamp255(v[0]), clamp255(v[1]), clamp255(v[2])];
    case 'oklab':
      return oklabToRgb(v[0], v[1], v[2]);
    case 'oklch': {
      const h = (v[2] * Math.PI) / 180;
      return oklabToRgb(v[0], v[1] * Math.cos(h), v[1] * Math.sin(h));
    }
  }
  return null;
}

/**
 * Any colour `parseColor` understands → `rgba(...)` with the given alpha.
 * Anything else is returned unchanged, so unusual palette strings still render.
 */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

/** WCAG relative luminance (sRGB → linear, 0.2126 / 0.7152 / 0.0722 weights). */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 (identical) … 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca);
  const lb = luminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Chroma (max − min channel) as a cheap saturation proxy; 0 for greys and unreadable strings. */
function chroma(color: string): number {
  const c = parseColor(color);
  return c ? Math.max(...c) - Math.min(...c) : 0;
}

/** Minimum contrast against `bg` for text / frames and for the chrome ground (WCAG large-text AA). */
export const MIN_CONTRAST = 3;

/**
 * Contrast-aware mapping from a sketch palette (palette[0] = background, as
 * in `randomPalette()`):
 *   bg = [0] · fg = the entry with the highest contrast against bg (must reach
 *   `MIN_CONTRAST`, else the fallback ink or paper depending on bg lightness;
 *   the most saturated entry is skipped when another legible one exists) ·
 *   accent = the most saturated remaining entry (must reach `MIN_CONTRAST`,
 *   else fg) · chromeBg = the
 *   remaining entry with the highest contrast against bg (must reach
 *   `MIN_CONTRAST`, else fg) · dim = fg @ 45 % · chromeFg = bg ·
 *   selectionBg = accent @ 30 %.
 * Ties keep palette order, so the result is deterministic. Palettes whose
 * background `parseColor` cannot read use the positional mapping
 * ([1] fg · [2] accent · [3] chromeBg). Missing entries fall through to `fallbackTheme`.
 */
export function themeFromPalette(palette: readonly string[]): TuiTheme {
  const [bg] = palette;
  if (!bg) return { ...fallbackTheme };
  const bgRgb = parseColor(bg);
  const candidates = palette.slice(1).filter((c) => parseColor(c) !== null);

  let ink: string;
  let hi: string;
  let chromeBg: string;
  if (!bgRgb || candidates.length === 0) {
    // Positional fallback: unknown colour strings, or no readable entries besides bg.
    const [, fg, accent, chrome] = palette;
    ink = fg ?? (bgRgb && luminance(bgRgb) > 0.5 ? fallbackTheme.bg : fallbackTheme.fg);
    hi = accent ?? ink;
    chromeBg = chrome ?? hi;
  } else {
    const byContrast = (list: string[]) =>
      list.reduce((best, c) => (contrastRatio(c, bg) > contrastRatio(best, bg) ? c : best));
    let bestInk = byContrast(candidates);
    // A vivid entry that happens to be the brightest/darkest is worth more as the
    // accent: when another entry is legible too, take the ink from those instead.
    const legible = candidates.filter((c) => contrastRatio(c, bg) >= MIN_CONTRAST);
    const vivid = candidates.reduce((best, c) => (chroma(c) > chroma(best) ? c : best));
    if (bestInk === vivid && chroma(vivid) > 0 && legible.some((c) => c !== vivid)) {
      bestInk = byContrast(legible.filter((c) => c !== vivid));
    }
    const inkOk = contrastRatio(bestInk, bg) >= MIN_CONTRAST;
    ink = inkOk ? bestInk : luminance(bgRgb) > 0.5 ? fallbackTheme.bg : fallbackTheme.fg;
    const rest = inkOk ? candidates.filter((c) => c !== bestInk) : candidates;
    const vividRest = rest.length ? rest.reduce((best, c) => (chroma(c) > chroma(best) ? c : best)) : ink;
    hi = contrastRatio(vividRest, bg) >= MIN_CONTRAST ? vividRest : ink;
    const chromeCandidates = rest.filter((c) => c !== vividRest);
    const bestChrome = chromeCandidates.length ? byContrast(chromeCandidates) : rest.length ? hi : ink;
    chromeBg = contrastRatio(bestChrome, bg) >= MIN_CONTRAST ? bestChrome : ink;
  }

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
