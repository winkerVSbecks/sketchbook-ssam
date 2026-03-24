import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../colors';

Random.setSeed(Random.getRandomSeed());

const shaft = Random.pick([4, 6, 8, 12]);
const over = Random.rangeFloor(1, shaft);

console.log({ seed: Random.getSeed(), shaft, over });

type PatternFn = (c: number, r: number, offset: number) => boolean;

// Diagonal stripe
function makeTwill(s: number, o: number): PatternFn {
  return (c, r, offset) =>
    ((c - r + offset + 10000 * s) % s + s) % s < o;
}

// Chevron — twill that mirrors direction every `shaft` rows
function makeHerringbone(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const rMod = ((r % period) + period) % period;
    const rFolded = rMod < s ? rMod : 2 * s - rMod - 1;
    return ((c - rFolded + offset + 10000 * s) % s + s) % s < o;
  };
}

// Diamond — diagonal folded to create lozenge shapes
function makeDiamond(s: number): PatternFn {
  const half = s / 2;
  const o = Math.max(1, Math.floor(s / 4));
  return (c, r, offset) => {
    const raw = ((c - r + offset + 10000 * s) % s + s) % s;
    const folded = raw < half ? raw : s - raw;
    return folded < o;
  };
}

// Houndstooth — 4×4 matrix tiled at given scale
function makeHoundstooth(scale: number): PatternFn {
  const m = [
    [1, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 1, 1, 0],
  ];
  return (c, r, offset) => {
    const row = (Math.floor(r / scale) % 4 + 4) % 4;
    const col = ((Math.floor(c / scale) + Math.floor(offset)) % 4 + 4) % 4;
    return m[row][col] === 1;
  };
}

const warpOnTop: PatternFn = Random.pick([
  makeTwill(shaft, over),
  makeHerringbone(shaft, over),
  makeDiamond(shaft),
  makeHoundstooth(Random.rangeFloor(1, 3)),
]);

const COLS = 20;
const ROWS = 20;
const WARP_RATIO = 0.65; // fraction of cell width occupied by warp thread
const WEFT_RATIO = 0.5; // fraction of cell height occupied by weft thread

const palette = randomPalette();
const WARP_COLOR = Random.pick(palette);
const WEFT_COLOR = Random.pick(palette.filter((c) => c !== WARP_COLOR));
const BG_COLOR = Random.pick(
  palette.filter((c) => c !== WARP_COLOR && c !== WEFT_COLOR),
);

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const pad = width * 0.08;
  const weaveW = width - pad * 2;
  const weaveH = height - pad * 2;
  const cellW = weaveW / COLS;
  const cellH = weaveH / ROWS;
  const warpW = cellW * WARP_RATIO;
  const weftH = cellH * WEFT_RATIO;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const offset = playhead * shaft;
    // Background is weft color — visible in gaps between warp threads
    context.fillStyle = BG_COLOR;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(pad, pad);

    // Warp threads: full-height vertical strips, drawn first (behind)
    context.fillStyle = WARP_COLOR;
    for (let c = 0; c < COLS; c++) {
      const x = c * cellW + (cellW - warpW) / 2;
      context.fillRect(x, 0, warpW, weaveH);
    }

    // Weft threads: horizontal strips drawn over warp only where weft is on top
    context.fillStyle = WEFT_COLOR;
    for (let r = 0; r < ROWS; r++) {
      const y = r * cellH + (cellH - weftH) / 2;
      for (let c = 0; c < COLS; c++) {
        if (!warpOnTop(c, r, offset)) {
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
  duration: 1000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
