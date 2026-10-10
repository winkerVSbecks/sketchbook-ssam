/**
 * Colour systems for the Atlas "Systems" lens.
 *
 * Two deterministic passes, both run by assemble.ts:
 *   - `colorSystemCatalog()` samples a few palettes from every system in
 *     src/colors (seeded, so the swatches only move when a system changes).
 *   - `detectColorSystems(path)` reads a sketch's source and follows its
 *     local imports to find which of those systems it actually draws from.
 *     Most sketches build their palette at runtime, so measured colour says
 *     little; the system it was dealt from says a lot.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import Random from 'canvas-sketch-util/random';

import { randomPalette } from '../../src/colors/index.ts';
import * as radix from '../../src/colors/radix.ts';
import { createPalette as rybPalette } from '../../src/colors/rybitten.ts';
import { generateColors } from '../../src/colors/subtractive-hue.ts';
import { generateColorSystem } from '../../src/colors/subtractive-shift.ts';
import { getPalette as texelPalette } from '../../src/colors/texel.ts';
import { SYSTEMS } from '../../src/sketches/terminal-ui/palette-systems.ts';

export type ColorSystem = {
  key: string;
  name: string;
  /** repo-relative module path(s) */
  source: string;
  /** rebuilt from a seed at runtime (vs a curated, fixed list) */
  generated: boolean;
  blurb: string;
  /** a few sample palettes, `[0]` = background as the sketches assume */
  samples: string[][];
};

const repoRoot = resolve(import.meta.dirname, '../..');
const colorsDir = join(repoRoot, 'src/colors');
const SAMPLE_COUNT = 3;
const SEED = 'atlas';

/** `count` entries spread evenly through a list, first and last included. */
function spread<T>(list: readonly T[], count: number): T[] {
  if (list.length <= count) return [...list];
  return Array.from(
    { length: count },
    (_, i) => list[Math.round((i * (list.length - 1)) / (count - 1))]!,
  );
}

const fromRegistry = (id: string): string[][] => {
  const system = SYSTEMS.find((s) => s.id === id);
  if (!system) throw new Error(`palette-systems has no "${id}"`);
  return spread(system.entries(SEED), SAMPLE_COUNT).map((e) => e.colors);
};

const seeded = <T>(tag: string, make: () => T): T => {
  Random.setSeed(`${SEED}/${tag}`);
  return make();
};

const radixSamples = (): string[][] =>
  (['crimson', 'teal', 'amber'] as const).map((hue) => {
    const ramp = radix.getRamp(hue, 'light') as Record<string, string>;
    return Object.values(ramp);
  });

const rybSamples = (): string[][] =>
  [0.85, 0.55, 0.3].map((l) => rybPalette([0, 45, 90, 150, 210, 270, 320].map((h) => [h, 0.9, l])));

/** Every system in src/colors, in the order they read best on the wall. */
export function colorSystemCatalog(): ColorSystem[] {
  return [
    {
      key: 'mix',
      name: 'random mix',
      source: 'src/colors/index.ts',
      generated: false,
      blurb: 'randomPalette() — one pick from clrs, auto-albers and mindful together',
      samples: seeded('mix', () => Array.from({ length: SAMPLE_COUNT }, randomPalette)),
    },
    {
      key: 'clrs',
      name: 'clrs',
      source: 'src/colors/clrs.ts',
      generated: false,
      blurb: 'curated named palettes',
      samples: fromRegistry('clrs'),
    },
    {
      key: 'auto-albers',
      name: 'auto-albers',
      source: 'src/colors/auto-albers.ts',
      generated: false,
      blurb: 'Albers-style grounds with interacting colours',
      samples: fromRegistry('auto-albers'),
    },
    {
      key: 'mindful',
      name: 'mindful',
      source: 'src/colors/mindful-palettes.ts',
      generated: false,
      blurb: 'soft curated palettes',
      samples: fromRegistry('mindful'),
    },
    {
      key: 'found',
      name: 'found',
      source: 'src/colors/found.ts',
      generated: false,
      blurb: 'palettes lifted from paintings and objects',
      samples: fromRegistry('found'),
    },
    {
      key: 'uchu',
      name: 'uchu',
      source: 'src/colors/uchu.ts',
      generated: false,
      blurb: 'OKLCH hue families with light / base / dark steps',
      samples: fromRegistry('uchu'),
    },
    {
      key: 'radix',
      name: 'radix',
      source: 'src/colors/radix.ts',
      generated: false,
      blurb: 'Radix P3 ramps, 12 steps per hue',
      samples: radixSamples(),
    },
    {
      key: 'riso',
      name: 'riso',
      source: 'src/colors/riso.ts',
      generated: true,
      blurb: 'riso inks dealt onto paper stocks, legible at 3:1',
      samples: fromRegistry('riso'),
    },
    {
      key: 'rybitten',
      name: 'rybitten',
      source: 'src/colors/rybitten.ts',
      generated: true,
      blurb: 'RYB colour wheels from historical colour cubes',
      samples: seeded('rybitten', rybSamples),
    },
    {
      key: 'subtractive',
      name: 'subtractive',
      source: 'src/colors/subtractive-hue.ts · subtractive-shift.ts',
      generated: true,
      blurb: 'rampensau hue ramps mixed subtractively through RYB',
      samples: seeded('subtractive', () => [
        generateColors('hex', 20),
        generateColors('hex', 200),
        generateColorSystem('hex')(),
      ]),
    },
    {
      key: 'cusphanger',
      name: 'cusphanger',
      source: 'src/colors/cusphanger.ts',
      generated: true,
      blurb: 'P3 ground with high / mid / low contrast tiers off a hue ring',
      samples: fromRegistry('cusphanger'),
    },
    {
      key: 'oklch',
      name: 'oklch',
      source: 'src/colors/oklch.ts',
      generated: true,
      blurb: 'harmony schemes generated in OKLCH',
      samples: fromRegistry('oklch'),
    },
    {
      key: 'hsluv',
      name: 'hsluv',
      source: 'src/colors/hsluv.ts',
      generated: true,
      blurb: 'three-hue schemes generated in HSLuv',
      samples: fromRegistry('hsluv'),
    },
    {
      key: 'texel',
      name: 'texel',
      source: 'src/colors/texel.ts · texel-random.ts',
      generated: true,
      blurb: 'gamut-mapped OKLCH tones on paper',
      samples: [
        texelPalette({ system: 0, colorSpace: 'srgb' }).slice(0, 9) as string[],
        texelPalette({ system: 1, colorSpace: 'srgb' }).slice(0, 4) as string[],
      ],
    },
  ];
}

// ---------- detection ----------

/** src/colors module (file name without extension) → system key. */
const MODULE_SYSTEM: Record<string, string> = {
  clrs: 'clrs',
  'auto-albers': 'auto-albers',
  'mindful-palettes': 'mindful',
  found: 'found',
  uchu: 'uchu',
  radix: 'radix',
  riso: 'riso',
  rybitten: 'rybitten',
  'subtractive-hue': 'subtractive',
  'subtractive-shift': 'subtractive',
  cusphanger: 'cusphanger',
  oklch: 'oklch',
  hsluv: 'hsluv',
  texel: 'texel',
  'texel-random': 'texel',
};

const IMPORT_RE = /(?:import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js'];
const MAX_DEPTH = 4;

function resolveLocal(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const ext of EXTENSIONS) {
    const p = base + ext;
    if (existsSync(p) && /\.(m?js|tsx?)$/.test(p)) return p;
  }
  return null;
}

/**
 * Colour-system keys a sketch draws from, in the order first imported. Follows
 * relative imports (series helpers, configs) a few levels deep; stops at
 * src/colors. Importing only the console loggers from src/colors/index.ts does
 * not count — `randomPalette` does.
 */
export function detectColorSystems(sketchPath: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (key: string) => {
    if (!found.includes(key)) found.push(key);
  };

  const visit = (file: string, depth: number) => {
    if (seen.has(file) || depth > MAX_DEPTH) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const [, clause, spec] of src.matchAll(IMPORT_RE)) {
      if (!spec!.startsWith('.')) continue;
      const target = resolveLocal(file, spec!);
      if (!target) continue;
      const rel = relative(colorsDir, target);
      if (!rel.startsWith('..')) {
        const mod = rel.replace(/\.(m?js|tsx?)$/, '');
        if (mod === 'index') {
          if (/\brandomPalette\b|\*/.test(clause!)) add('mix');
        } else if (MODULE_SYSTEM[mod]) add(MODULE_SYSTEM[mod]);
        continue;
      }
      visit(target, depth + 1);
    }
  };

  const abs = resolve(repoRoot, sketchPath);
  if (existsSync(abs)) visit(abs, 0);
  return found;
}
