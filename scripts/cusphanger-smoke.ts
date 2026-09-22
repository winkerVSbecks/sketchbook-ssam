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
  pickHues,
  ringHues,
  snippet,
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
  const d = Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  return d;
};

console.log('hues');

test('the ring steps from the base every `angle` degrees until the wheel closes', () => {
  assert.deepEqual(ringHues(10, 60), [10, 70, 130, 190, 250, 310]);
  assert.deepEqual(ringHues(350, 120), [350, 110, 230]);
  assert.equal(ringHues(0, 48).length, 7);
});

test('a wide angle still yields `count` hues, spaced evenly', () => {
  const ring = ringHues(0, 180, 3);
  assert.equal(ring.length, 3);
  assert.deepEqual(ring, [0, 120, 240]);
});

test('jitter moves every ring hue but the base', () => {
  Random.setSeed('smoke');
  const ring = ringHues(77, 90, 1, 10);
  assert.ok(hueDelta(ring[0], 77) < 1e-9);
  for (let i = 1; i < ring.length; i++) {
    const d = hueDelta(ring[i], 77 + i * 90);
    assert.ok(d > 1e-9 && d <= 10.01, `ring[${i}] = ${ring[i]}`);
  }
});

test('in sequence takes an arc from the base; shuffled draws gaps from the whole ring', () => {
  const ring = ringHues(40, 60);
  assert.deepEqual(pickHues(ring, 3, false), [40, 100, 160]);
  const still = cuspPalette({ hue: 40, angle: 60, jitter: 0, shuffle: false });
  assert.deepEqual(still.hues, [40, 100, 160]);
  assert.equal(still.baseIndex, 0);
  let beyondArc = 0;
  let baseLeft = 0;
  for (let i = 0; i < 12; i++) {
    Random.setSeed(`smoke/shuffle/${i}`);
    const p = cuspPalette({ hue: 40, angle: 60, jitter: 0 });
    assert.equal(p.hues.length, 3);
    assert.deepEqual(p.ring, ring);
    assert.deepEqual(
      p.hues,
      [...p.hues].sort((a, b) => a - b),
    );
    assert.equal(new Set(p.hues).size, 3);
    for (const h of p.hues) assert.ok(ring.includes(h), `${h} is not on the ring`);
    if (p.hues.some((h) => h > 160)) beyondArc++;
    if (p.baseIndex === -1) {
      baseLeft++;
      assert.ok(!p.hues.includes(40));
    } else {
      assert.equal(p.hues[p.baseIndex], 40);
      assert.equal(p.tiers.high[p.baseIndex].hueIndex, p.baseIndex);
    }
  }
  assert.ok(beyondArc > 0, 'the shuffle never reached past the first three');
  assert.ok(baseLeft > 0, 'the shuffle never left the base out');
});

console.log('palette');

const inP3 = inGamut('p3');
const inSrgb = inGamut('rgb');
/** The shell LUTs are an inner approximation; allow culori a hair of slack. */
const nearlyIn = (
  check: (c: unknown) => boolean,
  c: { mode: 'oklch'; l: number; c: number; h: number },
) => check(c) || check({ ...c, c: c.c * 0.985 });

for (const ground of ['light', 'dark'] as const) {
  for (const gamut of ['p3', 'srgb'] as const) {
    test(`${ground} · ${gamut}: tiers land near their contrast targets, in gamut`, () => {
      Random.setSeed(`smoke/${ground}/${gamut}`);
      const p = cuspPalette({ ground, gamut, angle: 120 });
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
          assert.ok(
            Math.abs(s.contrast - target) / target < 0.25,
            `${tier} ${s.css} contrast ${s.contrast.toFixed(2)} vs ${target}`,
          );
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
  const p = cuspPalette({ saturation: 0, angle: 180, count: 2 });
  for (const s of p.fg) assert.ok(s.color.c < 0.005, `${s.css}`);
});

test('P3 reaches further than sRGB at the same hue', () => {
  Random.setSeed('smoke/reach');
  const p3 = cuspPalette({
    hue: 145,
    ground: 'light',
    gamut: 'p3',
    angle: 120,
    jitter: 0,
    shuffle: false,
    saturation: 1,
  });
  Random.setSeed('smoke/reach');
  const srgb = cuspPalette({
    hue: 145,
    ground: 'light',
    gamut: 'srgb',
    angle: 120,
    jitter: 0,
    shuffle: false,
    saturation: 1,
  });
  const maxC = (colors: { c: number }[]) => Math.max(...colors.map((c) => c.c));
  assert.ok(maxC(p3.ramps[0]) > maxC(srgb.ramps[0]));
});

test('the TUI theme reads the oklch() strings and the same seed repeats', () => {
  Random.setSeed('smoke/theme');
  const p = cuspPalette({ ground: 'dark', angle: 60 });
  for (const c of p.colors) assert.ok(parseColor(c), c);
  const theme = themeFromPalette(p.colors);
  assert.equal(theme.bg, p.bg.css);
  Random.setSeed('smoke/theme');
  assert.deepEqual(cuspPalette({ ground: 'dark', angle: 60 }).colors, p.colors);
});

test('snippet prints one line per colour with the ground annotated', () => {
  Random.setSeed('smoke/snippet');
  const p = cuspPalette({ angle: 30 });
  const lines = snippet(p).split('\n');
  assert.equal(lines.length, 3 + p.colors.length);
  assert.match(lines[2], /\/\/ bg$/);
  assert.match(snippet(p, 'hex').split('\n')[2], /^  '#[0-9a-f]{6}',/);
  assert.match(snippet(p, 'p3').split('\n')[3], /color\(display-p3/);
});

console.log(`\n${passed} passed`);
