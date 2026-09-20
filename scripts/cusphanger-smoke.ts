/**
 * Node smoke test for `src/colors/cusphanger.ts` — pure colour maths, no canvas.
 * Run: `npx tsx scripts/cusphanger-smoke.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';

import Random from 'canvas-sketch-util/random';
import { inGamut } from 'culori';

import {
  contrastOf,
  cuspPalette,
  HARMONIES,
  harmonyHues,
  MONO_FLOOR,
  snippet,
  spreadFor,
  TIER_TARGETS,
  TIERS,
} from '../src/colors/cusphanger';
import { parseColor, themeFromPalette } from '../src/tui';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const hueDelta = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
};

console.log('hues');

test('mono 1 pulls every hue into the base family without duplicating it', () => {
  Random.setSeed('smoke');
  for (const h of HARMONIES) {
    const hues = harmonyHues(200, h, 1, 8);
    for (const hue of hues) assert.ok(hueDelta(hue, 200) <= MONO_FLOOR * 248 + 1e-9, `${h}: ${hue}`);
    assert.equal(new Set(hues.map((x) => x.toFixed(6))).size, hues.length, `${h} has duplicate hues`);
  }
  assert.ok(hueDelta(harmonyHues(200, 'complementary', 1)[1], 200) > 10);
});

test('spread runs from the full harmony to the floor', () => {
  assert.equal(spreadFor(0), 1);
  assert.ok(Math.abs(spreadFor(1) - MONO_FLOOR) < 1e-12);
  assert.ok(spreadFor(0.5) > spreadFor(0.75));
});

test('mono 0 triadic sits 120° apart (± jitter)', () => {
  Random.setSeed('smoke');
  const hues = harmonyHues(10, 'triadic', 0, 4);
  assert.equal(hues.length, 3);
  assert.ok(hueDelta(hues[1], 130) <= 4.01);
  assert.ok(hueDelta(hues[2], 250) <= 4.01);
});

test('the base hue is never jittered', () => {
  Random.setSeed('smoke');
  const hues = harmonyHues(77, 'tetradic', 0, 10);
  assert.ok(hueDelta(hues[0], 77) < 1e-9);
});

console.log('palette');

const inP3 = inGamut('p3');
const inSrgb = inGamut('rgb');
/** The shell LUTs are an inner approximation; allow culori a hair of slack. */
const nearlyIn = (check: (c: unknown) => boolean, c: { mode: 'oklch'; l: number; c: number; h: number }) =>
  check(c) || check({ ...c, c: c.c * 0.985 });

for (const ground of ['light', 'dark'] as const) {
  for (const gamut of ['p3', 'srgb'] as const) {
    test(`${ground} · ${gamut}: tiers land near their contrast targets, in gamut`, () => {
      Random.setSeed(`smoke/${ground}/${gamut}`);
      const p = cuspPalette({ ground, gamut, harmony: 'triadic', mono: 0.3 });
      assert.equal(p.hues.length, 3);
      assert.equal(p.fg.length, 9);
      assert.equal(p.colors.length, 10);
      assert.equal(p.colors[0], p.bg.css);
      const check = gamut === 'p3' ? inP3 : inSrgb;
      assert.ok(nearlyIn(check, p.bg.color), `bg ${p.bg.css}`);
      for (const tier of TIERS) {
        for (const s of p.tiers[tier]) {
          assert.ok(nearlyIn(check, s.color), `${tier} ${s.css} out of ${gamut}`);
          const target = TIER_TARGETS[tier];
          assert.ok(Math.abs(s.contrast - target) / target < 0.25, `${tier} ${s.css} contrast ${s.contrast.toFixed(2)} vs ${target}`);
          assert.ok(Math.abs(contrastOf(s.color, p.bg.color) - s.contrast) < 1e-9);
        }
      }
      // The tiers are ordered by contrast for every hue.
      for (let i = 0; i < p.hues.length; i++) {
        assert.ok(p.tiers.high[i].contrast > p.tiers.mid[i].contrast);
        assert.ok(p.tiers.mid[i].contrast > p.tiers.low[i].contrast);
      }
    });
  }
}

test('light grounds are light, dark grounds are dark', () => {
  Random.setSeed('smoke/ground');
  assert.ok(cuspPalette({ ground: 'light' }).bg.color.l > 0.9);
  assert.ok(cuspPalette({ ground: 'dark' }).bg.color.l < 0.25);
});

test('saturation 0 is a grey ramp', () => {
  Random.setSeed('smoke/grey');
  const p = cuspPalette({ saturation: 0, harmony: 'complementary' });
  for (const s of p.fg) assert.ok(s.color.c < 0.005, `${s.css}`);
});

test('P3 reaches further than sRGB at the same hue', () => {
  Random.setSeed('smoke/reach');
  const p3 = cuspPalette({ hue: 145, ground: 'light', gamut: 'p3', harmony: 'complementary', mono: 1, saturation: 1 });
  Random.setSeed('smoke/reach');
  const srgb = cuspPalette({ hue: 145, ground: 'light', gamut: 'srgb', harmony: 'complementary', mono: 1, saturation: 1 });
  const maxC = (colors: { c: number }[]) => Math.max(...colors.map((c) => c.c));
  assert.ok(maxC(p3.ramps[0]) > maxC(srgb.ramps[0]));
});

test('the TUI theme reads the oklch() strings and the same seed repeats', () => {
  Random.setSeed('smoke/theme');
  const p = cuspPalette({ ground: 'dark', harmony: 'split' });
  for (const c of p.colors) assert.ok(parseColor(c), c);
  const theme = themeFromPalette(p.colors);
  assert.equal(theme.bg, p.bg.css);
  Random.setSeed('smoke/theme');
  assert.deepEqual(cuspPalette({ ground: 'dark', harmony: 'split' }).colors, p.colors);
});

test('snippet prints one line per colour with the ground annotated', () => {
  Random.setSeed('smoke/snippet');
  const p = cuspPalette({ harmony: 'analogous' });
  const lines = snippet(p).split('\n');
  assert.equal(lines.length, 3 + p.colors.length);
  assert.match(lines[2], /\/\/ bg$/);
  assert.match(snippet(p, 'hex').split('\n')[2], /^  '#[0-9a-f]{6}',/);
  assert.match(snippet(p, 'p3').split('\n')[3], /color\(display-p3/);
});

console.log(`\n${passed} passed`);
