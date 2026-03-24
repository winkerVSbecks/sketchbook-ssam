import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

Random.setSeed(Random.getRandomSeed());

// Twill parameters — randomly selected from valid weave structures
const shaft = Random.pick([4, 6, 8, 12]);
const over = Random.rangeFloor(1, shaft);

console.log({ seed: Random.getSeed(), shaft, over });

// true = warp on top, false = weft on top
// A twill shifts the pattern by one column per row, creating diagonal stripes
function makeWeavePattern(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      ((c - r + 10000 * shaft) % shaft) < over
    )
  );
}

const COLS = 20;
const ROWS = 20;
const WARP_COLOR = '#1a1a1a';
const WEFT_COLOR = '#f0ead8';
const WARP_RATIO = 0.65; // fraction of cell width occupied by warp thread
const WEFT_RATIO = 0.5;  // fraction of cell height occupied by weft thread

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const pattern = makeWeavePattern(COLS, ROWS);
  const pad = width * 0.08;
  const weaveW = width - pad * 2;
  const weaveH = height - pad * 2;
  const cellW = weaveW / COLS;
  const cellH = weaveH / ROWS;
  const warpW = cellW * WARP_RATIO;
  const weftH = cellH * WEFT_RATIO;

  wrap.render = ({ width, height }: SketchProps) => {
    // Background is weft color — visible in gaps between warp threads
    context.fillStyle = WEFT_COLOR;
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
        if (!pattern[r][c]) {
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
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
