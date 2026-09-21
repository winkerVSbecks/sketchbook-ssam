/**
 * cusphanger: a ground + tiered-foreground colour system built on
 * `cusphanger` (Wijffelaars et al. palettes as OKLCH Bézier paths through a
 * hue's gamut triangle) and `nutelch` (gamut-shell maths, Display-P3 aware).
 *
 * The recipe:
 *   1. pick a **base hue** and a **ground** — a light paper or a dark slate,
 *      tinted with the base hue a little way toward the shell (`relch`);
 *   2. choose the foreground **hues off a ring**: from the base, step round
 *      the wheel every `angle` degrees until it closes (`ringHues`), shuffle
 *      the ring and take `count` hues, sorted. Harmony is a dial, not a rule —
 *      a small angle gives analogous neighbours, 120° a triad, 180° a
 *      complement — and shuffling draws gaps instead of an arc, so the hues
 *      stop reading like every generator's sequence (`shuffle: false` takes
 *      the first `count` in order). `baseIndex` says where the base landed;
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

export type Ground = 'light' | 'dark';
export type Gamut = 'p3' | 'srgb';

/** `angle` is drawn from this range when omitted: analogous neighbours up to a triad. */
export const ANGLE_RANGE: [number, number] = [30, 120];

/** WCAG ratios the tiers aim for against the ground. */
export const TIER_TARGETS: Record<Tier, number> = { high: 9, mid: 4.5, low: 1.6 };

export interface CuspOptions {
  /** Base hue 0–360 — where the ring starts and what tints the ground; random when omitted. */
  hue?: number;
  /** Degrees between neighbouring hues on the ring, 1–180; random in `ANGLE_RANGE` when omitted. */
  angle?: number;
  /** How many hues are taken off the ring. Default 3. */
  count?: number;
  /** The paper's `s` — tension of the Bézier toward the cusp. Default 0.6. */
  saturation?: number;
  /** The paper's `w` — pulls the light end of every ramp toward yellow. Default 0. */
  coolWarm?: number;
  /** Light paper or dark slate; random when omitted. */
  ground?: Ground;
  /** Gamut shell the colours are clamped to. Default `p3`. */
  gamut?: Gamut;
  /** ± degrees of seeded jitter on every ring hue but the base, so they don't sit on exact multiples. Default 4. */
  jitter?: number;
  /**
   * Shuffle the ring before taking `count` hues (seeded), so the picks are
   * spread round the wheel with gaps between them; `false` takes the first
   * `count` in sequence — an arc from the base. Default true.
   */
  shuffle?: boolean;
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
  /** The foreground hues actually used, ascending; the tiers follow this order. */
  hues: number[];
  /** Every hue on the ring the picks were drawn from, base first. */
  ring: number[];
  /** Where the base hue — the ground's — sits in `hues`; −1 when the shuffle left it out. */
  baseIndex: number;
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

/**
 * The hue ring: from `base`, a hue every `angle` degrees until the wheel
 * closes — `floor(360 / angle)` points, but never fewer than `count`, so a wide
 * angle with many hues wanted falls back to spacing them evenly. Every point
 * but the base is jittered.
 */
export function ringHues(base: number, angle: number, count = 1, jitter = 0): number[] {
  const step = Math.min(180, Math.max(1, angle));
  const n = Math.max(count, Math.floor(360 / step));
  const spacing = n * step > 360 ? 360 / n : step;
  return Array.from({ length: n }, (_, i) => {
    const j = i === 0 || jitter <= 0 ? 0 : Random.range(-jitter, jitter);
    return wrapHue(base + i * spacing + j);
  });
}

/** `count` hues off the ring — shuffled for gaps, or the first `count` for an arc — ascending. */
export function pickHues(ring: number[], count: number, shuffle = true): number[] {
  const pool = shuffle ? (Random.shuffle(ring) as number[]) : ring;
  return pool.slice(0, Math.max(1, Math.min(count, ring.length))).sort((a, b) => a - b);
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
    angle: opts.angle ?? Random.range(...ANGLE_RANGE),
    count: opts.count ?? 3,
    saturation: opts.saturation ?? 0.6,
    coolWarm: opts.coolWarm ?? 0,
    ground: opts.ground ?? Random.pick(['light', 'dark'] as Ground[]),
    gamut: opts.gamut ?? 'p3',
    jitter: opts.jitter ?? 4,
    shuffle: opts.shuffle ?? true,
    targets: { ...TIER_TARGETS, ...opts.targets },
  };
  const targets = options.targets as Record<Tier, number>;
  const lut = lutFor(options.gamut);
  const base = wrapHue(options.hue);

  const bg = groundColor(base, options.ground, lut);
  const ring = ringHues(base, options.angle, options.count, options.jitter);
  const hues = pickHues(ring, options.count, options.shuffle);
  const baseIndex = hues.indexOf(ring[0]);

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
    ring,
    baseIndex,
    ramps,
    options,
    lut,
  };
}

/** A random ground, base and ring angle, three hues — the `randomPalette()`-shaped entry point. */
export const randomCuspPalette = (): string[] => cuspPalette().colors;

/** One line of the palette's provenance, for headers and code comments. */
export function describe(p: CuspPalette): string {
  const o = p.options;
  const pick = `${o.count} of ${p.ring.length}${o.shuffle ? ' shuffled' : ' in sequence'}`;
  return `ring ${Math.round(o.angle)}° · h ${Math.round(wrapHue(o.hue))} · ${pick} · s ${o.saturation.toFixed(2)} · ${o.ground} · ${o.gamut}`;
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
