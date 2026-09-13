import { TUI_FONT_FAMILY } from './metrics';

export interface TuiTheme {
  /** Desktop / window body background. */
  bg: string;
  /** Body text and frames. */
  fg: string;
  /** Secondary text in controls (translucent; not for frames). */
  dim: string;
  /** Inactive window frames — box glyphs, title, buttons, grip. Solid, ≥ `MIN_CONTRAST` (3:1) against `bg` so it recedes. */
  frame: string;
  /** Front-window frame. Solid, ≥ `AA_CONTRAST` (4.5:1) against `bg`. */
  frameActive: string;
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
  frame: '#5e5e5e',
  frameActive: '#f2f2f2',
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
  const c = parseRgba(color);
  return c ? [c[0], c[1], c[2]] : null;
}

type Rgba = readonly [number, number, number, number];

/** Like `parseColor`, plus the alpha (0–1, default 1) from `#rrggbbaa`, `rgba(…, a)` or `… / a`. */
function parseRgba(color: string): Rgba | null {
  const c = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
  }
  const fn = /^(rgba?|oklab|oklch)\((.*)\)$/i.exec(c);
  if (!fn) return null;
  const v = args(fn[2]);
  if (v.length < 3 || v.some((n) => Number.isNaN(n))) return null;
  const a = v.length > 3 ? Math.min(1, Math.max(0, v[3])) : 1;
  switch (fn[1].toLowerCase()) {
    case 'rgb':
    case 'rgba':
      return [clamp255(v[0]), clamp255(v[1]), clamp255(v[2]), a];
    case 'oklab':
      return [...oklabToRgb(v[0], v[1], v[2]), a];
    case 'oklch': {
      const h = (v[2] * Math.PI) / 180;
      return [...oklabToRgb(v[0], v[1] * Math.cos(h), v[1] * Math.sin(h)), a];
    }
  }
  return null;
}

const toHex = ([r, g, b]: Rgb): string => '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');

/** Gamma-space mix: `t` = 0 → `a`, 1 → `b`. */
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(clamp255) as unknown as Rgb;

/**
 * A translucent colour flattened over a solid one → opaque `#rrggbb`, so its
 * contrast can be measured. Opaque or unreadable colours come back unchanged.
 */
export function composite(color: string, over: string): string {
  const c = parseRgba(color);
  const o = parseColor(over);
  if (!c || !o || c[3] >= 1) return color;
  return toHex(mix(o, [c[0], c[1], c[2]], c[3]));
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

/** Minimum contrast against `bg` for body text and for the chrome ground (WCAG large-text AA). */
export const MIN_CONTRAST = 3;

/** Minimum contrast for the active window frame and highlighted text (WCAG text-level AA). */
export const AA_CONTRAST = 4.5;

/** Pure black or white — whichever contrasts more with `bg` (always ≥ 4.58:1 against any opaque colour). */
function extremeInk(bg: string): string {
  return contrastRatio('#000000', bg) >= contrastRatio('#ffffff', bg) ? '#000000' : '#ffffff';
}

/**
 * Binary-search the gamma-space mix of `from` toward `to` for the point where
 * `contrastRatio(mix, bg)` crosses `min`. `keepAbove` = true returns the
 * furthest mix that still reaches `min` (fading toward `to`); false returns
 * the nearest mix that reaches `min` (strengthening toward `to`), or `to`
 * itself when even that falls short. Luminance is monotonic in the mix.
 */
function mixToContrast(from: string, to: string, bg: string, min: number, keepAbove: boolean): string {
  const a = parseColor(from);
  const b = parseColor(to);
  if (!a || !b) return from;
  const ok = (t: number) => contrastRatio(toHex(mix(a, b, t)), bg) >= min;
  if (keepAbove ? !ok(0) : ok(0)) return toHex(a);
  if (!keepAbove && !ok(1)) return toHex(b);
  // Invariant: ok(lo) === keepAbove, ok(hi) === !keepAbove.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid) === keepAbove) lo = mid;
    else hi = mid;
  }
  return toHex(mix(a, b, keepAbove ? lo : hi));
}

/**
 * The first of `preferred` that reaches `AA_CONTRAST` against `bg`, else pure
 * black or white. For text drawn over highlights whose ground is not `bg`.
 * Translucent `bg` values should be flattened with `composite` first.
 */
export function legibleOn(bg: string, ...preferred: string[]): string {
  return preferred.find((c) => contrastRatio(c, bg) >= AA_CONTRAST) ?? extremeInk(bg);
}

/**
 * Frame pair for `bg` from an ink that already reaches `AA_CONTRAST`:
 * `frameActive` is that ink; `frame` is it faded toward `bg` as far as
 * `MIN_CONTRAST` (3:1, WCAG graphics AA) allows, so inactive frames visibly
 * recede. Both are opaque hex strings.
 */
function framePair(ink: string, bg: string): { frame: string; frameActive: string } {
  const a = parseColor(ink);
  const frameActive = a ? toHex(a) : ink;
  const frame = mixToContrast(frameActive, bg, bg, MIN_CONTRAST, true);
  return { frame, frameActive };
}

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
 *   selectionBg = accent @ 30 % · frameActive = the ink (or the
 *   highest-contrast entry reaching `AA_CONTRAST`, else pure black/white),
 *   ≥ 4.5:1 · frame = frameActive faded toward bg to just ≥ 3:1 — see `framePair`.
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
  let frames: { frame: string; frameActive: string };
  if (!bgRgb || candidates.length === 0) {
    // Positional fallback: unknown colour strings, or no readable entries besides bg.
    const [, fg, accent, chrome] = palette;
    ink = fg ?? (bgRgb && luminance(bgRgb) > 0.5 ? fallbackTheme.bg : fallbackTheme.fg);
    hi = accent ?? ink;
    chromeBg = chrome ?? hi;
    // Unmeasurable: both frames are the ink; the box style alone tells the states apart.
    frames = bgRgb ? framePair(ink, bg) : { frame: ink, frameActive: ink };
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
    // The active frame needs text-level AA: the ink when it gets there, else the
    // strongest palette entry that does (often the accent), else pure black/white.
    const aa = candidates.filter((c) => contrastRatio(c, bg) >= AA_CONTRAST);
    const frameInk = contrastRatio(ink, bg) >= AA_CONTRAST ? ink : aa.length ? byContrast(aa) : extremeInk(bg);
    frames = framePair(frameInk, bg);
  }

  return {
    bg,
    fg: ink,
    dim: withAlpha(ink, 0.45),
    ...frames,
    accent: hi,
    chromeBg,
    chromeFg: bg,
    selectionBg: withAlpha(hi, 0.3),
    font: TUI_FONT_FAMILY,
  };
}
