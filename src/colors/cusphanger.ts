/**
 * cusphanger: a ground + tiered-foreground colour system built on
 * `cusphanger` (Wijffelaars et al. palettes as OKLCH Bézier paths through a
 * hue's gamut triangle) and `nutelch` (gamut-shell maths, Display-P3 aware).
 *
 * The recipe:
 *   1. pick a **base hue** and a **ground** — a light paper or a dark slate,
 *      tinted with the base hue a little way toward the shell (`relch`);
 *   2. choose the foreground **hues by colour theory**: a harmony's offsets
 *      (analogous · complementary · split · triadic · tetradic) scaled down as
 *      `mono` rises, so `mono = 0` is the full harmony and `mono = 1` pulls
 *      every hue into the base's family (a small floor keeps them distinct);
 *   3. for every foreground hue run the paper's **sequential ramp** through the
 *      cusp (`saturation` is its tension, `coolWarm` its multi-hue drift), then
 *      pick three samples by WCAG contrast against the ground — the **high**
 *      (≈9:1, ink), **mid** (≈4.5:1, accent) and **low** (≈1.6:1, wash) tiers.
 *
 * Every colour is an `oklch()` string clamped to the chosen gamut's shell by
 * construction, so a `display-p3` canvas renders the P3 palettes without
 * clipping; `hex` is the sRGB-clipped fallback. Pure maths, no canvas — runs
 * in node (see `scripts/cusphanger-smoke.ts`). Randomness comes from
 * `canvas-sketch-util/random`, seed it before calling like the other systems.
 */
import Random from 'canvas-sketch-util/random';
import { converter, formatCss, formatHex } from 'culori';
import { maxChromaAt, sequential, type OklchColor } from 'cusphanger';
import { oklchP3, oklchSrgb, relch, toCss, type Lut } from 'nutelch';

export type Tier = 'high' | 'mid' | 'low';
export const TIERS: readonly Tier[] = ['high', 'mid', 'low'];

export type Harmony = 'analogous' | 'complementary' | 'split' | 'triadic' | 'tetradic';
export const HARMONIES: readonly Harmony[] = ['analogous', 'complementary', 'split', 'triadic', 'tetradic'];

export type Ground = 'light' | 'dark';
export type Gamut = 'p3' | 'srgb';

/**
 * Hue offsets from the base, in OKLCH degrees. The base is always first so
 * it anchors the palette (and shares its hue with the ground).
 */
export const HARMONY_OFFSETS: Record<Harmony, readonly number[]> = {
  analogous: [0, 30, -30],
  complementary: [0, 180],
  split: [0, 150, 210],
  triadic: [0, 120, 240],
  // The rectangle tetrad (two complementary pairs 60° apart) rather than the square.
  tetradic: [0, 60, 180, 240],
};

/**
 * How much of a harmony's spread survives at `mono = 1`: enough that the
 * foregrounds stay distinct swatches of one hue family instead of collapsing
 * onto identical colours (complementary at `mono = 1` sits ~14° apart).
 */
export const MONO_FLOOR = 0.08;

/** WCAG ratios the tiers aim for against the ground. */
export const TIER_TARGETS: Record<Tier, number> = { high: 9, mid: 4.5, low: 1.6 };

export interface CuspOptions {
  /** Base hue 0–360; random when omitted. */
  hue?: number;
  /** Which harmony supplies the foreground hues; random when omitted. */
  harmony?: Harmony;
  /** 0 = the harmony's full spread, 1 = every foreground hugs the base hue (see `MONO_FLOOR`). Default 0.5. */
  mono?: number;
  /** The paper's `s` — tension of the Bézier toward the cusp. Default 0.6. */
  saturation?: number;
  /** The paper's `w` — pulls the light end of every ramp toward yellow. Default 0. */
  coolWarm?: number;
  /** Light paper or dark slate; random when omitted. */
  ground?: Ground;
  /** Gamut shell the colours are clamped to. Default `p3`. */
  gamut?: Gamut;
  /** ± degrees of seeded hue jitter (scaled by `1 − mono`), so harmonies don't sit on exact multiples. Default 4. */
  jitter?: number;
  /** Override the WCAG targets per tier. */
  targets?: Partial<Record<Tier, number>>;
}

export interface CuspSwatch {
  color: OklchColor;
  /** `oklch(l c h)` — the colour as the canvas and CSS take it, in gamut by construction. */
  css: string;
  /** sRGB-clipped `#rrggbb` fallback. */
  hex: string;
  /** `color(display-p3 r g b)`. */
  p3: string;
  /** Chroma as a fraction of the shell at this lightness and hue (nutelch's `relC`). */
  relC: number;
  /** WCAG contrast against the ground (1 for the ground itself). */
  contrast: number;
  /** Which of `hues` this swatch belongs to (−1 for the ground). */
  hueIndex: number;
  tier: Tier | 'bg';
}

export interface CuspPalette {
  bg: CuspSwatch;
  tiers: Record<Tier, CuspSwatch[]>;
  /** Every foreground swatch, tier-major (high…, mid…, low…). */
  fg: CuspSwatch[];
  /** `[bg, ...fg]` as `oklch()` strings — the shape every sketch palette takes. */
  colors: string[];
  /** The foreground hues actually used (base first). */
  hues: number[];
  /** The paper's ramp per hue (dense, dark → light), for plotting. */
  ramps: OklchColor[][];
  options: Required<CuspOptions>;
  lut: Lut;
}

const toXyz = converter('xyz65');
const toP3 = converter('p3');

const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

/** WCAG relative luminance of an OKLCH colour, exact (through XYZ), no gamut clipping. */
export const luminanceOf = (c: OklchColor): number => Math.max(0, toXyz(c).y);

/** WCAG contrast ratio between two OKLCH colours. */
export function contrastOf(a: OklchColor, b: OklchColor): number {
  const ya = luminanceOf(a);
  const yb = luminanceOf(b);
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
}

export const lutFor = (gamut: Gamut): Lut => (gamut === 'p3' ? oklchP3 : oklchSrgb);

const swatch = (color: OklchColor, bg: OklchColor, lut: Lut, hueIndex: number, tier: Tier | 'bg'): CuspSwatch => {
  const shell = maxChromaAt(color.h, color.l, lut);
  return {
    color,
    css: toCss(color),
    hex: formatHex(color) ?? '#000000',
    p3: formatCss(toP3(color)),
    relC: shell > 0 ? color.c / shell : 0,
    contrast: contrastOf(color, bg),
    hueIndex,
    tier,
  };
};

/** Samples in the paper's ramp for one hue: dense enough to pick tiers by contrast. */
const RAMP_STEPS = 48;
/** The ramp's lightness span; short of pure black/white so the ends keep a little hue. */
const RAMP_RANGE: [number, number] = [0.06, 0.98];

/** The fraction of a harmony's offsets kept at a monochromaticness: 1 at `mono = 0`, `MONO_FLOOR` at `mono = 1`. */
export const spreadFor = (mono: number): number => 1 - (1 - MONO_FLOOR) * Math.min(1, Math.max(0, mono));

/**
 * The foreground hues for a harmony at a monochromaticness: the offsets shrink
 * toward the base as `mono` rises (never quite onto it); the jitter shrinks with them.
 */
export function harmonyHues(base: number, harmony: Harmony, mono: number, jitter = 0): number[] {
  const spread = spreadFor(mono);
  return HARMONY_OFFSETS[harmony].map((offset, i) => {
    const j = i === 0 || jitter <= 0 ? 0 : Random.range(-jitter, jitter);
    return wrapHue(base + (offset + j) * spread);
  });
}

/** The tinted ground: a near-white paper or a near-black slate, a little way toward the shell. */
export function groundColor(hue: number, ground: Ground, lut: Lut): OklchColor {
  const l = ground === 'light' ? Random.range(0.94, 0.975) : Random.range(0.13, 0.2);
  // The shell is thin this close to black and white, so even half of it is a paper-like tint.
  const relC = ground === 'light' ? Random.range(0.25, 0.6) : Random.range(0.2, 0.5);
  const c = relch({ lut, l, relC, h: hue });
  return { mode: 'oklch', l: c.l, c: c.c, h: c.h };
}

/** The ramp sample whose contrast against `bg` is nearest `target`. */
const pickByContrast = (ramp: OklchColor[], bg: OklchColor, target: number): OklchColor =>
  ramp.reduce((best, c) => (Math.abs(contrastOf(c, bg) - target) < Math.abs(contrastOf(best, bg) - target) ? c : best));

export function cuspPalette(opts: CuspOptions = {}): CuspPalette {
  const options: Required<CuspOptions> = {
    hue: opts.hue ?? Random.range(0, 360),
    harmony: opts.harmony ?? Random.pick([...HARMONIES]),
    mono: opts.mono ?? 0.5,
    saturation: opts.saturation ?? 0.6,
    coolWarm: opts.coolWarm ?? 0,
    ground: opts.ground ?? Random.pick(['light', 'dark'] as Ground[]),
    gamut: opts.gamut ?? 'p3',
    jitter: opts.jitter ?? 4,
    targets: { ...TIER_TARGETS, ...opts.targets },
  };
  const targets = options.targets as Record<Tier, number>;
  const lut = lutFor(options.gamut);
  const base = wrapHue(options.hue);

  const bg = groundColor(base, options.ground, lut);
  const hues = harmonyHues(base, options.harmony, options.mono, options.jitter);

  const ramps = hues.map((h) =>
    sequential({
      hStart: h,
      total: RAMP_STEPS,
      saturation: options.saturation,
      coolWarm: options.coolWarm,
      lRange: RAMP_RANGE,
      lut,
    }),
  );

  const tiers: Record<Tier, CuspSwatch[]> = { high: [], mid: [], low: [] };
  for (const tier of TIERS) {
    ramps.forEach((ramp, i) => tiers[tier].push(swatch(pickByContrast(ramp, bg, targets[tier]), bg, lut, i, tier)));
  }
  const fg = TIERS.flatMap((t) => tiers[t]);
  const bgSwatch = swatch(bg, bg, lut, -1, 'bg');

  return {
    bg: bgSwatch,
    tiers,
    fg,
    colors: [bgSwatch.css, ...fg.map((s) => s.css)],
    hues,
    ramps,
    options,
    lut,
  };
}

/** A random ground + harmony at the default monochromaticness — the `randomPalette()`-shaped entry point. */
export const randomCuspPalette = (): string[] => cuspPalette().colors;

/** One line of the palette's provenance, for headers and code comments. */
export function describe(p: CuspPalette): string {
  const o = p.options;
  return `${o.harmony} · h ${Math.round(wrapHue(o.hue))} · mono ${o.mono.toFixed(2)} · s ${o.saturation.toFixed(2)} · ${o.ground} · ${o.gamut}`;
}

/** The palette as a sketch declares one, ready to paste. */
export function snippet(p: CuspPalette, format: 'oklch' | 'hex' | 'p3' = 'oklch'): string {
  const value = (s: CuspSwatch) => (format === 'hex' ? s.hex : format === 'p3' ? s.p3 : s.css);
  const note = (s: CuspSwatch) => (s.tier === 'bg' ? 'bg' : `${s.tier} ${s.contrast.toFixed(1)}:1`);
  return [
    `// cusphanger · ${describe(p)} · src/colors/cusphanger.ts`,
    'export const palette = [',
    ...[p.bg, ...p.fg].map((s) => `  '${value(s)}', // ${note(s)}`),
    '];',
  ].join('\n');
}
