/**
 * The colour systems of `src/colors`, read as a picker would: every system is
 * a list of named palettes (`palette[0]` = background, as `randomPalette()`
 * and `themeFromPalette` assume). Static systems are the curated arrays
 * (clrs, auto-albers, mindful, found, uchu); generated systems (riso, oklch,
 * hsluv) rebuild their palettes from a seed, so `reseed` deals a fresh hand
 * without leaving the system. Pure data + colour maths — no canvas, so it
 * runs headless.
 */
import Random from 'canvas-sketch-util/random';
import { converter } from 'culori';
import risoColors from 'riso-colors';
import paperColors from 'paper-colors';

import { palettes as albersPalettes } from '../../colors/auto-albers';
import { clrs } from '../../colors/clrs';
import { cuspPalette, HARMONIES, type Ground } from '../../colors/cusphanger';
import * as found from '../../colors/found';
import * as hsluv from '../../colors/hsluv';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import * as oklch from '../../colors/oklch';
import { uchu, uchuExpanded, uchuHues } from '../../colors/uchu';
import { composite, contrastRatio, MIN_CONTRAST, parseColor, themeFromPalette, type TuiTheme } from '../../tui';

export interface PaletteEntry {
  /** Short label as the library lists it (`carmen`, `albers 03`, `Kraft`). */
  name: string;
  colors: string[];
}

export interface PaletteSystem {
  id: string;
  /** Where the system lives, for the code comment (`src/colors/clrs.ts`). */
  source: string;
  /** Generated systems rebuild from the seed; static ones ignore it. */
  generated: boolean;
  entries(seed: string): PaletteEntry[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const numbered = (prefix: string, lists: readonly (readonly string[])[]): PaletteEntry[] =>
  lists.map((colors, i) => ({ name: `${prefix} ${pad2(i + 1)}`, colors: [...colors] }));

/** `ellsworthKelly` → `ellsworth kelly`: the export names as labels. */
const words = (id: string) => id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

const foundEntries = (): PaletteEntry[] =>
  Object.entries(found)
    .filter((e): e is [string, string[]] => Array.isArray(e[1]))
    .map(([name, colors]) => ({ name: words(name), colors: [...colors] }));

/** uchu: the base set on yang, the light set on yin, then one ramp per hue and the yin ramp. */
const uchuEntries = (): PaletteEntry[] => {
  const { yang, yin } = uchu.general;
  const entries: PaletteEntry[] = [
    { name: 'base', colors: [yang, ...uchuHues.map((h) => uchu[h].base)] },
    { name: 'light on yin', colors: [yin, ...uchuHues.map((h) => uchu[h].light)] },
    { name: 'dark on yang', colors: [yang, ...uchuHues.map((h) => uchu[h].dark)] },
  ];
  for (const hue of uchuHues) entries.push({ name: `${hue} ramp`, colors: [yang, ...Object.values(uchuExpanded[hue])] });
  entries.push({ name: 'yin ramp', colors: [yang, ...Object.values(uchuExpanded.yin)] });
  return entries;
};

/** The two untyped colour lists ship as `{ name, hex, … }` records. */
interface Stock {
  name: string;
  hex: string;
}
const risoInks = risoColors as Stock[];
const papers = paperColors as Stock[];

const RISO_INKS = 5;

/** riso: every paper stock with a seeded hand of inks that reach 3:1 on it, as `riso.ts` deals them. */
const risoEntries = (seed: string): PaletteEntry[] => {
  Random.setSeed(`${seed}/riso`);
  const inks = risoInks.filter((ink) => ink.hex !== '#000000');
  return papers.map((paper) => {
    const legible = inks.filter((ink) => contrastRatio(paper.hex, ink.hex) >= MIN_CONTRAST);
    const hand: Stock[] = Random.shuffle(legible).slice(0, RISO_INKS);
    return { name: paper.name.toLowerCase(), colors: [paper.hex, ...hand.map((ink) => ink.hex)] };
  });
};

/** One entry per scheme function, each seeded by name so a reseed changes them all together. */
const schemeEntries =
  (tag: string, schemes: Record<string, () => string[]>) =>
  (seed: string): PaletteEntry[] =>
    Object.entries(schemes).map(([name, make]) => {
      Random.setSeed(`${seed}/${tag}/${name}`);
      return { name: words(name), colors: make() };
    });

/** cusphanger: every harmony on both grounds at three monochromaticness levels, dealt from the seed (P3 shell). */
const cuspEntries = (seed: string): PaletteEntry[] => {
  const entries: PaletteEntry[] = [];
  for (const ground of ['light', 'dark'] as Ground[]) {
    for (const harmony of HARMONIES) {
      for (const mono of [0, 0.5, 0.85]) {
        const name = `${harmony} ${mono.toFixed(2)} ${ground}`;
        Random.setSeed(`${seed}/cusphanger/${name}`);
        entries.push({ name, colors: cuspPalette({ harmony, mono, ground }).colors });
      }
    }
  }
  return entries;
};

export const SYSTEMS: readonly PaletteSystem[] = [
  { id: 'clrs', source: 'src/colors/clrs.ts', generated: false, entries: () => numbered('clrs', clrs) },
  { id: 'auto-albers', source: 'src/colors/auto-albers.ts', generated: false, entries: () => numbered('albers', albersPalettes) },
  { id: 'mindful', source: 'src/colors/mindful-palettes.ts', generated: false, entries: () => numbered('mindful', mindfulPalettes) },
  { id: 'found', source: 'src/colors/found.ts', generated: false, entries: foundEntries },
  { id: 'uchu', source: 'src/colors/uchu.ts', generated: false, entries: uchuEntries },
  { id: 'riso', source: 'src/colors/riso.ts', generated: true, entries: risoEntries },
  { id: 'cusphanger', source: 'src/colors/cusphanger.ts', generated: true, entries: cuspEntries },
  {
    id: 'oklch',
    source: 'src/colors/oklch.ts',
    generated: true,
    entries: schemeEntries('oklch', {
      kellyInspiredScheme: oklch.kellyInspiredScheme,
      splitComplementary: oklch.splitComplementary,
      complementary: oklch.complementary,
      triadic: oklch.triadic,
      pentadic: oklch.pentadic,
      hexadic: oklch.hexadic,
      superSaturated: oklch.superSaturated,
    }),
  },
  {
    id: 'hsluv',
    source: 'src/colors/hsluv.ts',
    generated: true,
    entries: schemeEntries('hsluv', {
      randomThreeHueScheme: hsluv.randomThreeHueScheme,
      threeHueHighContrastScheme: hsluv.threeHueHighContrastScheme,
      kellyInspiredScheme: hsluv.kellyInspiredScheme,
    }),
  },
];

// ─── Readouts ───────────────────────────────────────────────────────────────

const toOklch = converter('oklch');

export interface ColorReadout {
  /** `#rrggbb`, gamut-clipped; the input when it cannot be parsed. */
  hex: string;
  /** OKLCH lightness 0–100, chroma, hue 0–360 (hue 0 for greys). */
  l: number;
  c: number;
  h: number;
}

/** Any palette string `parseColor` reads → hex + OKLCH coordinates for the swatch table. */
export function readout(color: string): ColorReadout | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const hex = '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const ok = toOklch({ mode: 'rgb', r: rgb[0] / 255, g: rgb[1] / 255, b: rgb[2] / 255 });
  return { hex, l: ok.l * 100, c: ok.c, h: ok.h ?? 0 };
}

/** `#rrggbb` for any readable colour, else the string itself (so odd palette entries still print). */
export const hexOf = (color: string): string => readout(color)?.hex ?? color;

/** Contrast against `bg` as the picker prints it: `21.0` … `1.0`, one decimal, four cells wide. */
export const ratio = (color: string, bg: string): string => contrastRatio(composite(color, bg), bg).toFixed(1).padStart(4, ' ');

const sameColor = (a: string, b: string): boolean => {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return !!ca && !!cb && ca[0] === cb[0] && ca[1] === cb[1] && ca[2] === cb[2];
};

/**
 * Which theme roles `themeFromPalette` hands each entry: `bg` for [0], then
 * `fg` / `accent` / `chrome` for the entries it picked (an entry can hold two
 * when the palette is short). Unpicked entries get an empty list.
 */
export function rolesFor(palette: readonly string[], theme: TuiTheme = themeFromPalette(palette)): string[][] {
  return palette.map((color, i) => {
    const roles: string[] = [];
    if (i === 0) roles.push('bg');
    else {
      if (sameColor(color, theme.fg)) roles.push('fg');
      if (sameColor(color, theme.accent)) roles.push('accent');
      if (sameColor(color, theme.chromeBg)) roles.push('chrome');
    }
    return roles;
  });
}

/** `[bgIndex]` first, the rest in palette order — the picker's "make this the ground". */
export function withBackground(colors: readonly string[], bgIndex: number): string[] {
  if (bgIndex <= 0 || bgIndex >= colors.length) return [...colors];
  return [colors[bgIndex], ...colors.filter((_, i) => i !== bgIndex)];
}

export interface SnippetOptions {
  system: PaletteSystem;
  entry: PaletteEntry;
  colors: readonly string[];
  /** Print `#rrggbb` instead of the palette's own strings. */
  hex?: boolean;
}

/** The palette as the sketches declare one, ready to paste; `[0]` is annotated as the background. */
export function snippet({ system, entry, colors, hex = false }: SnippetOptions): string {
  const quote = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
  const lines = [
    `// ${system.id} · ${entry.name} · ${system.source}`,
    'export const palette = [',
    ...colors.map((c, i) => `  ${quote(hex ? hexOf(c) : c)},${i === 0 ? ' // bg' : ''}`),
    '];',
  ];
  return lines.join('\n');
}
