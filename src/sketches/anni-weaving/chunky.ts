import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColorRamp, colorToCSS } from 'rampensau';
import { Pane } from 'tweakpane';

Random.setSeed(Random.getRandomSeed());

const shaft = Random.pick([4, 6, 8]);
const over = Random.rangeFloor(1, shaft);

console.log({ seed: Random.getSeed(), shaft, over });

type PatternFn = (c: number, r: number, offset: number) => boolean;

function makeTwill(s: number, o: number): PatternFn {
  return (c, r, offset) => (((c - r + offset + 10000 * s) % s) + s) % s < o;
}

function makeHerringbone(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const rMod = ((r % period) + period) % period;
    const rFolded = rMod < s ? rMod : 2 * s - rMod - 1;
    return (((c - rFolded + offset + 10000 * s) % s) + s) % s < o;
  };
}

function makeDiamond(s: number): PatternFn {
  const half = s / 2;
  const o = Math.max(1, Math.floor(s / 4));
  return (c, r, offset) => {
    const raw = (((c - r + offset + 10000 * s) % s) + s) % s;
    const folded = raw < half ? raw : s - raw;
    return folded < o;
  };
}

function makeHoundstooth(scale: number): PatternFn {
  const m = [
    [1, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 1, 1, 0],
  ];
  return (c, r, _offset) => {
    const row = ((Math.floor(r / scale) % 4) + 4) % 4;
    const col = ((Math.floor(c / scale) % 4) + 4) % 4;
    return m[row][col] === 1;
  };
}

function makeBasket(n: number): PatternFn {
  return (c, r, _offset) => {
    const cGroup = Math.floor(c / n);
    const rGroup = Math.floor(r / n);
    return (cGroup + rGroup) % 2 === 0;
  };
}

function makeBrokenTwill(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const cMod = ((c % period) + period) % period;
    const dir = cMod < s ? 1 : -1;
    return (((dir * (c - r) + offset + 10000 * s) % s) + s) % s < o;
  };
}

function satinStep(s: number): number {
  for (let step = 2; step < s - 1; step++) {
    if (gcd(step, s) === 1) return step;
  }
  return 2;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function makeSatin(s: number): PatternFn {
  const step = satinStep(s);
  return (c, r, offset) =>
    (((c - r * step + Math.floor(offset) + 10000 * s) % s) + s) % s < 1;
}

const warpOnTop: PatternFn = Random.pick([
  makeTwill(shaft, over),
  makeHerringbone(shaft, over),
  makeDiamond(shaft),
  makeHoundstooth(Random.rangeFloor(1, 3)),
  makeBasket(Random.rangeFloor(2, 4)),
  makeBrokenTwill(shaft, over),
  makeSatin(shaft),
]);

// Two offset hues — warp and weft read as distinct color families
const hueA = Random.range(0, 1);
const hueB = (hueA + Random.range(0.35, 0.65)) % 1;

type EasingFn = (x: number) => number;

const easings: EasingFn[] = [
  (x) => x,
  (x) => x * x,
  (x) => 1 - (1 - x) * (1 - x),
  (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
];

// Approximate WCAG relative luminance from oklch L (0–1)
// oklch L is perceptually uniform like CIELAB L*, so L^3 approximates relative luminance
function relLum(l: number): number {
  return Math.pow(Math.max(0, l), 3);
}

function wcagContrast(l1: number, l2: number): number {
  const hi = relLum(Math.max(l1, l2));
  const lo = relLum(Math.min(l1, l2));
  return (hi + 0.05) / (lo + 0.05);
}

// Thread lRanges constrained to medium-light (≥ 0.48) so a dark bg
// can always achieve contrast ≥ 3 with the darkest thread
const MAX = 64;
const warpLRange: [number, number] = [
  Random.range(0.48, 0.65),
  Random.range(0.72, 0.92),
];
const weftLRange: [number, number] = [
  Random.range(0.48, 0.65),
  Random.range(0.72, 0.92),
];

const warpRamp = generateColorRamp({
  total: MAX,
  hStart: hueA,
  hEasing: Random.pick(easings),
  hCycles: Random.pick([0, 1 / 4, 1 / 3, 1 / 2, 1]),
  sRange: [Random.range(0.1, 0.4), Random.range(0.5, 0.9)],
  sEasing: Random.pick(easings),
  lRange: warpLRange,
  lEasing: Random.pick(easings),
}).map((c) => colorToCSS(c, 'oklch'));

const weftRamp = generateColorRamp({
  total: MAX,
  hStart: hueB,
  hEasing: Random.pick(easings),
  hCycles: Random.pick([0, 1 / 4, 1 / 3, 1 / 2, 1]),
  sRange: [Random.range(0.1, 0.4), Random.range(0.5, 0.9)],
  sEasing: Random.pick(easings),
  lRange: weftLRange,
  lEasing: Random.pick(easings),
}).map((c) => colorToCSS(c, 'oklch'));

// Compute bg lightness: darkest L that still achieves contrast ≥ 3 with the
// darkest thread, then pull back 15% for a safe margin
const minThreadL = Math.min(warpLRange[0], weftLRange[0]);
const bgLum = relLum(minThreadL) / 3 + 0.05 / 3 - 0.05;
const bgL = Math.pow(bgLum, 1 / 3) * 0.85;

// Use hue of the darker ramp, low saturation so threads read as the main color
const bgHue = warpLRange[0] < weftLRange[0] ? hueA : hueB;
const bgColor = colorToCSS(
  generateColorRamp({
    total: 1,
    hStart: bgHue,
    sRange: [0.1, 0.2],
    lRange: [bgL * 0.9, bgL],
  })[0],
  'oklch',
);

const config = {
  cols: Random.rangeFloor(8, 24),
  rows: Random.rangeFloor(8, 24),
  warpRatio: Random.range(0.6, 0.95),
  weftRatio: Random.range(0.5, 0.9),
  pad: Random.range(0.03, 0.12),
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'cols', { min: 4, max: 48, step: 1 });
pane.addBinding(config, 'rows', { min: 4, max: 48, step: 1 });
pane.addBinding(config, 'warpRatio', { min: 0.3, max: 1.0, step: 0.01 });
pane.addBinding(config, 'weftRatio', { min: 0.3, max: 1.0, step: 0.01 });
pane.addBinding(config, 'pad', { min: 0, max: 0.2, step: 0.01 });

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    const pad = width * config.pad;
    const weaveW = width - pad * 2;
    const weaveH = height - pad * 2;
    const cellW = weaveW / config.cols;
    const cellH = weaveH / config.rows;
    const warpW = cellW * config.warpRatio;
    const weftH = cellH * config.weftRatio;

    context.fillStyle = bgColor;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(pad, pad);

    // Warp threads — each column gets its own color from the warp ramp
    for (let c = 0; c < config.cols; c++) {
      const idx = Math.floor((c / config.cols) * MAX);
      context.fillStyle = warpRamp[idx];
      const x = c * cellW + (cellW - warpW) / 2;
      context.fillRect(x, 0, warpW, weaveH);
    }

    // Weft threads — each row gets its own color, drawn over warp where weft is on top
    for (let r = 0; r < config.rows; r++) {
      const idx = Math.floor((r / config.rows) * MAX);
      context.fillStyle = weftRamp[idx];
      const y = r * cellH + (cellH - weftH) / 2;
      for (let c = 0; c < config.cols; c++) {
        if (!warpOnTop(c, r, 0)) {
          context.fillRect(c * cellW, y, cellW, weftH);
        }
      }
    }

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);
