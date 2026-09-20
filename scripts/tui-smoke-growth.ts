/**
 * Node smoke test for `src/sketches/terminal-ui/growth-sim.ts`.
 * Run: `npx tsx scripts/tui-smoke-growth.ts` — exits non-zero on the first failure.
 */
import assert from 'node:assert/strict';

import {
  DEFAULT_GROWTH_PARAMS,
  createGrowth,
  perimeter,
  type GrowthState,
} from '../src/sketches/terminal-ui/growth-sim';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const advance = (g: { step(dt?: number): GrowthState }, n: number) => {
  for (let i = 0; i < n; i++) g.step();
};

/** Positions as a comparable string, at full double precision. */
const fingerprint = (s: GrowthState): string =>
  s.nodes.map((p) => `${p.x},${p.y}`).join(';');

/** Every edge length, wrapping only when the curve is closed. */
function edgeLengths(s: GrowthState): number[] {
  const n = s.nodes.length;
  const last = s.closed ? n : n - 1;
  const out: number[] = [];
  for (let i = 0; i < last; i++) {
    const a = s.nodes[i];
    const b = s.nodes[(i + 1) % n];
    out.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  return out;
}

console.log('growth-sim');

test('seed ring: closed, inside the spacing band, deterministic for a seed', () => {
  const a = createGrowth({ seed: 42 });
  const b = createGrowth({ seed: 42 });
  assert.equal(a.state.closed, true);
  assert.equal(a.state.step, 0);
  assert.ok(a.state.nodes.length >= 6, 'seed ring has nodes');
  assert.equal(fingerprint(a.state), fingerprint(b.state));
  assert.notEqual(fingerprint(a.state), fingerprint(createGrowth({ seed: 43 }).state));
  const [min, max] = [DEFAULT_GROWTH_PARAMS.minEdgeLength, DEFAULT_GROWTH_PARAMS.maxEdgeLength];
  for (const d of edgeLengths(a.state)) {
    assert.ok(d >= min && d <= max, `seed edge ${d.toFixed(3)} outside [${min}, ${max}]`);
  }
});

test('determinism: same seed and step count give identical positions', () => {
  const a = createGrowth({ seed: 9 });
  const b = createGrowth({ seed: 9 });
  advance(a, 200);
  advance(b, 200);
  assert.equal(a.state.nodes.length, b.state.nodes.length);
  assert.equal(fingerprint(a.state), fingerprint(b.state));
  assert.equal(a.state.step, 200);
  const c = createGrowth({ seed: 10 });
  advance(c, 200);
  assert.notEqual(fingerprint(c.state), fingerprint(a.state), 'a different seed diverges');
});

test('reseed: restarts from the seed shape; an explicit seed replays exactly', () => {
  const g = createGrowth({ seed: 5 });
  const start = fingerprint(g.state);
  advance(g, 120);
  const grown = fingerprint(g.state);
  g.reseed();
  assert.equal(g.state.step, 0);
  assert.equal(fingerprint(g.state), start, 'reseed() reuses the current seed');
  advance(g, 120);
  assert.equal(fingerprint(g.state), grown, 'and replays the same organism');
  g.reseed(77);
  assert.equal(g.seed, 77);
  advance(g, 120);
  const other = createGrowth({ seed: 77 });
  advance(other, 120);
  assert.equal(fingerprint(g.state), fingerprint(other.state));
});

test('spacing: every edge stays inside [min, max] after each step', () => {
  const g = createGrowth({ seed: 11, maxEdgeLength: 0.4, minEdgeLength: 0.16 });
  for (let i = 0; i < 400; i++) {
    g.step();
    if (i % 40 !== 0) continue;
    for (const d of edgeLengths(g.state)) {
      assert.ok(d >= 0.16 - 1e-9, `edge ${d.toFixed(4)} below min at step ${i}`);
      assert.ok(d <= 0.4 + 1e-9, `edge ${d.toFixed(4)} above max at step ${i}`);
    }
  }
  assert.ok(g.state.nodes.length < DEFAULT_GROWTH_PARAMS.maxNodes, 'stayed under the cap');
});

test('spacing: minEdgeLength is honoured only up to half of maxEdgeLength', () => {
  // Misconfigured on purpose: min > max would make split and collapse fight.
  const g = createGrowth({ seed: 12, maxEdgeLength: 0.3, minEdgeLength: 5 });
  advance(g, 60);
  for (const d of edgeLengths(g.state)) {
    assert.ok(d >= 0.15 - 1e-9, `edge ${d.toFixed(4)} below the clamped min`);
    assert.ok(d <= 0.3 + 1e-9, `edge ${d.toFixed(4)} above max`);
  }
});

test('subdivision: a long seed edge is split into equal parts on the first step', () => {
  // 8 nodes on a radius-4 ring → ~3.06 per edge, well past maxEdgeLength.
  const g = createGrowth({
    seed: 1,
    radius: 4,
    nodeCount: 8,
    jitter: 0,
    maxEdgeLength: 1,
    minEdgeLength: 0.2,
    speed: 0,
    injectionRate: 0,
  });
  assert.equal(g.state.nodes.length, 8);
  g.step();
  // Each of the 8 edges needs ceil(3.06 / 1) = 4 parts → 8 × 4 = 32 nodes.
  assert.equal(g.state.nodes.length, 32);
  for (const d of edgeLengths(g.state)) assert.ok(d <= 1 + 1e-9);
  const before = g.state.nodes.length;
  g.step();
  assert.equal(g.state.nodes.length, before, 'a resampled curve is stable at speed 0');
});

test('collapse: crowded nodes merge away instead of piling up', () => {
  const g = createGrowth({
    seed: 2,
    radius: 1,
    nodeCount: 400,
    jitter: 0,
    maxEdgeLength: 0.5,
    minEdgeLength: 0.2,
    speed: 0,
    injectionRate: 0,
  });
  assert.equal(g.state.nodes.length, 400);
  g.step();
  // Circumference 2π ≈ 6.28; at a 0.2 floor no more than ~31 nodes survive.
  assert.ok(g.state.nodes.length <= 32, `collapsed to ${g.state.nodes.length}`);
  for (const d of edgeLengths(g.state)) assert.ok(d >= 0.2 - 1e-9);
});

test('growth: the perimeter rises monotonically at every checkpoint', () => {
  const g = createGrowth({ seed: 4 });
  let last = perimeter(g.state);
  let lastCount = g.state.nodes.length;
  for (let c = 0; c < 8; c++) {
    advance(g, 50);
    const p = perimeter(g.state);
    assert.ok(p > last, `perimeter ${p.toFixed(2)} did not exceed ${last.toFixed(2)}`);
    assert.ok(g.state.nodes.length > lastCount, 'and the node count rises with it');
    last = p;
    lastCount = g.state.nodes.length;
  }
  // Convolution: perimeter² / 4π·area ≫ 1 means the curve buckled rather than
  // simply inflating (a circle sits at 1 against its own bounding disc).
  const b = g.bounds();
  const convolution = (last * last) / (4 * Math.PI * b.w * b.h);
  assert.ok(convolution > 5, `convolution ${convolution.toFixed(2)} — the curve is not folding`);
});

test('bounds: matches a brute-force box and contains every node', () => {
  const g = createGrowth({ seed: 6, origin: { x: -3.5, y: 12 } });
  advance(g, 90);
  const b = g.bounds();
  const xs = g.state.nodes.map((p) => p.x);
  const ys = g.state.nodes.map((p) => p.y);
  assert.equal(b.x, Math.min(...xs));
  assert.equal(b.y, Math.min(...ys));
  assert.equal(b.w, Math.max(...xs) - Math.min(...xs));
  assert.equal(b.h, Math.max(...ys) - Math.min(...ys));
  assert.ok(b.w > 0 && b.h > 0);
  const eps = 1e-12;
  for (const p of g.state.nodes) {
    assert.ok(p.x >= b.x && p.x <= b.x + b.w + eps, 'x inside the box');
    assert.ok(p.y >= b.y && p.y <= b.y + b.h + eps, 'y inside the box');
  }
  assert.ok(Math.abs((b.x + b.w / 2) - -3.5) < 2, 'still centred near the origin');
});

test('open strand: endpoints are free, edges are n − 1', () => {
  const g = createGrowth({ seed: 8, closed: false, radius: 3 });
  assert.equal(g.state.closed, false);
  const firstBefore = { ...g.state.nodes[0] };
  advance(g, 80);
  assert.equal(edgeLengths(g.state).length, g.state.nodes.length - 1);
  for (const d of edgeLengths(g.state)) {
    assert.ok(d >= DEFAULT_GROWTH_PARAMS.minEdgeLength - 1e-9);
    assert.ok(d <= DEFAULT_GROWTH_PARAMS.maxEdgeLength + 1e-9);
  }
  assert.notEqual(g.state.nodes[0].x, firstBefore.x, 'the free end moves');
  assert.ok(perimeter(g.state) > 2 * 3, 'the strand lengthened');
});

test('params are live: speed 0 freezes, injectionRate 0 stops injection', () => {
  const g = createGrowth({ seed: 13 });
  advance(g, 60);
  const frozen = fingerprint(g.state);
  g.params.speed = 0;
  g.params.injectionRate = 0;
  advance(g, 25);
  assert.equal(fingerprint(g.state), frozen, 'nothing moves and nothing is added');
  g.params.speed = 1;
  advance(g, 5);
  assert.notEqual(fingerprint(g.state), frozen, 'and it resumes when speed comes back');
});

test('maxNodes caps the organism', () => {
  const g = createGrowth({ seed: 14, maxNodes: 300 });
  advance(g, 400);
  assert.ok(g.state.nodes.length <= 300, `capped at ${g.state.nodes.length}`);
  assert.ok(g.state.nodes.length >= 290, 'and it actually reaches the cap');
});

test('performance: a 3000-node organism steps inside a 24 fps frame', () => {
  const budget = 1000 / 24;
  const g = createGrowth({ seed: 21 });
  let small = 0;
  for (let i = 0; i < 4000 && g.state.nodes.length < 3000; i++) {
    g.step();
    if (g.state.nodes.length >= 750 && small === 0) small = time(g, 30);
  }
  assert.ok(g.state.nodes.length >= 3000, 'grew to 3000 nodes');
  assert.ok(small > 0, 'the small-organism baseline was measured');
  const big = time(g, 40);
  const n = g.state.nodes.length;
  console.log(
    `    ${n} nodes: ${big.toFixed(2)} ms/step (budget ${budget.toFixed(1)} ms) · ` +
      `${small.toFixed(2)} ms at ~750 nodes → ${(big / small).toFixed(1)}× for ${(n / 750).toFixed(1)}× the nodes`,
  );
  assert.ok(big < budget, `${big.toFixed(2)} ms/step exceeds the ${budget.toFixed(1)} ms budget`);
  // O(n²) would be ~16× for 4× the nodes; the spatial hash keeps it near linear.
  assert.ok(
    big / small < 10,
    `cost scaled ${(big / small).toFixed(1)}× — neighbour search looks quadratic`,
  );
});

function time(g: ReturnType<typeof createGrowth>, steps: number): number {
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) g.step();
  return (performance.now() - t0) / steps;
}

console.log(`\n${passed} tests passed`);
