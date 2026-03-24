import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
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

// Signal-2: dominant color field with a single pop of contrast.
// Nearly all warp and weft threads share one base color; one warp column
// and one weft row are assigned a contrasting accent color, creating
// a single bright interruption in an otherwise monochromatic weave.

function makePanel(hue: number, lightness: number, chroma: number): string {
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${(hue * 360).toFixed(1)}deg)`;
}

// Base hue — the dominant color filling most of the grid
const baseHue = Random.range(0, 1);
// Accent hue — a strong interval away for contrast pop
const accentHue = (baseHue + Random.pick([1 / 3, 5 / 12, 1 / 2, 7 / 12])) % 1;

const baseL = Random.range(0.38, 0.62);
const baseC = Random.range(0.10, 0.18);
const baseColor = makePanel(baseHue, baseL, baseC);

// Accent is lighter or darker and more saturated for maximum pop
const accentL = baseL > 0.5 ? Random.range(0.28, 0.42) : Random.range(0.58, 0.74);
const accentC = Random.range(0.16, 0.24);
const accentColor = makePanel(accentHue, accentL, accentC);

// White/near-white background
const bgColor = makePanel(baseHue, 0.96, 0.01);

// Grid dimensions
const numCols = Random.rangeFloor(4, 10);
const numRows = Random.rangeFloor(4, 10);

// Pick one accent column and one accent row; all others get the base color
const accentCol = Random.rangeFloor(0, numCols);
const accentRow = Random.rangeFloor(0, numRows);

const colColors: string[] = Array.from({ length: numCols }, (_, i) =>
  i === accentCol ? accentColor : baseColor,
);
const rowColors: string[] = Array.from({ length: numRows }, (_, i) =>
  i === accentRow ? accentColor : baseColor,
);

const config = {
  cols: numCols,
  rows: numRows,
  warpRatio: 1.0,
  weftRatio: 1.0,
  pad: Random.range(0.04, 0.1),
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'cols', { min: 2, max: 16, step: 1 });
pane.addBinding(config, 'rows', { min: 2, max: 16, step: 1 });
pane.addBinding(config, 'warpRatio', { min: 0.5, max: 1.0, step: 0.01 });
pane.addBinding(config, 'weftRatio', { min: 0.5, max: 1.0, step: 0.01 });
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

    // Draw warp columns first — merge consecutive same-color columns into one rect
    let warpStart = 0;
    for (let c = 1; c <= config.cols; c++) {
      const prevColor = colColors[(c - 1) % colColors.length];
      const currColor = c < config.cols ? colColors[c % colColors.length] : null;
      if (currColor !== prevColor) {
        context.fillStyle = prevColor;
        context.fillRect(warpStart * cellW, 0, (c - warpStart) * cellW, weaveH);
        warpStart = c;
      }
    }

    // Draw weft row segments where weft is on top — merge consecutive cells per row
    for (let r = 0; r < config.rows; r++) {
      const y = r * cellH;
      context.fillStyle = rowColors[r % rowColors.length];
      let spanStart = -1;
      for (let c = 0; c <= config.cols; c++) {
        const onTop = c < config.cols && !warpOnTop(c, r, 0);
        if (onTop && spanStart === -1) {
          spanStart = c;
        } else if (!onTop && spanStart !== -1) {
          context.fillRect(spanStart * cellW, y, (c - spanStart) * cellW, weftH);
          spanStart = -1;
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
