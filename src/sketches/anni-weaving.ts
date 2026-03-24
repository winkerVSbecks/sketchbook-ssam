import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../colors';

Random.setSeed(Random.getRandomSeed());

// Twill parameters — randomly selected from valid weave structures
const shaft = Random.pick([4, 6, 8, 12]);
const over = Random.rangeFloor(1, shaft);

console.log({ seed: Random.getSeed(), shaft, over });

// true = warp on top, false = weft on top
// offset shifts the diagonal, creating animation when driven by playhead
function warpOnTop(c: number, r: number, offset: number): boolean {
  return (c - r + offset + 10000 * shaft) % shaft < over;
}

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
