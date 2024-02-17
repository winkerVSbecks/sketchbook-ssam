import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import Color from 'canvas-sketch-util/color';
import { mapRange } from 'canvas-sketch-util/math';
import { generateColors } from '../subtractive-color';

type Mode = 'fill' | 'stripe';
type Cell = {
  x: number;
  y: number;
  color: string;
  mode: Mode;
};

const config = {
  rows: 9,
  columns: 12,
  stripeCount: 12,
  margin: 0.1,
  border: 6,
  animate: true,
};

const randomMode = () =>
  Random.weightedSet([
    {
      value: 'fill',
      weight: 60,
    },
    { value: 'stripe', weight: 40 },
  ]) as unknown as Mode;

const baseColors = generateColors('hex');

function generateColorPairs() {
  let pairs = [];

  for (let i = 0; i < baseColors.length; i++) {
    for (let j = 0; j < baseColors.length; j++) {
      if (i === j) continue;
      pairs.push([baseColors[i], baseColors[j]]);
    }
  }

  pairs = pairs.filter((pair) => Color.contrastRatio(pair[0], pair[1]) > 2);

  return pairs;
}

// https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Anni_Albers_%281899%E2%80%931994%29%2C_Design_for_a_Silk_Tapestry%2C_1926.jpg/1024px-Anni_Albers_%281899%E2%80%931994%29%2C_Design_for_a_Silk_Tapestry%2C_1926.jpg
export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColorPairs();
  const margin = width * config.margin;
  const w = (width - 2 * margin) / config.columns;
  const h = (height - 2 * margin) / config.rows / config.stripeCount;

  const cells: Cell[] = [];

  // let cellDefs = Array.from({ length: config.columns * config.rows }, () => ({
  //   mode: randomMode(),
  //   colors: Random.pick(colors),
  // }));

  let cellDefs: { mode: Mode; colors: string[] }[] = [];

  for (let row = 0; row < config.rows * config.stripeCount; row++) {
    if (row % config.stripeCount === 0) {
      cellDefs = Array.from({ length: config.columns * config.rows }, () => ({
        mode: randomMode(),
        colors: Random.pick(colors),
      }));
    }

    for (let column = 0; column < config.columns; column++) {
      const { colors, mode } = cellDefs[column];

      const x = column * w;
      const y = row * h;

      cells.push({
        x,
        y,
        color: mode === 'stripe' ? colors[row % 2 === 0 ? 0 : 1] : colors[0],
        mode,
      });
    }
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = baseColors.at(-1)!;
    context.lineWidth = 6;
    context.strokeRect(
      margin - config.border / 2,
      margin - config.border / 2,
      width - 2 * margin + config.border,
      height - 2 * margin + config.border
    );

    context.save();
    context.translate(margin, margin);

    const limit = mapRange(playhead, 0, 0.6, 0, 1, true) * cells.length;

    cells.forEach((cell, idx) => {
      if (idx > limit && config.animate) return;
      context.fillStyle = cell.color;
      context.fillRect(cell.x, cell.y, w, h);
    });
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600 * 2, 800 * 2],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
