import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { clrs } from '../colors/clrs';
import { drawClixo } from './draw-clixo';

const colors = Random.pick(clrs);
const bg = colors.pop();
const [ring, inner, ...bases] = Random.shuffle(colors);

const config = {
  xCount: 7 * 3,
  yCount: 7 * 3,
  trim: true,
};

if (bases.length < 4) {
  bases.push(Random.pick([inner, ...bases]));
}

// Check for An+B type patterns
function matchesPattern(a: number, b: number, x: number): boolean {
  return (x - b) % a === 0;
}

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const res = [2 * config.xCount + 1, 2 * config.yCount + 1];
    const size = [width / res[0], height / res[1]];
    const r = size[0] / 2;

    const limits = {
      x: [config.trim ? 0 : -2, config.trim ? res[0] - 2 : res[0]],
      y: [config.trim ? 0 : -2, config.trim ? res[1] - 2 : res[1]],
    };

    const grid = [];

    for (let i = limits.x[0]; i < limits.x[1]; i++) {
      for (let j = limits.y[0]; j < limits.y[1]; j++) {
        const x = i * size[0];
        const y = j * size[1];

        grid.push({
          x: i,
          y: j,
          cx: x + r,
          cy: y + r,
        });
      }
    }

    grid.forEach(({ x, y, cx, cy }) => {
      if (matchesPattern(2, 0, y) && matchesPattern(2, 0, x)) {
        const base = Math.floor(
          mapRange(Random.noise2D(cx, cy, 0.002, 1), -1, 1, 0, 1) * bases.length
        );
        drawClixo(context, cx, cy, r, { ring, inner, base: bases[base] });
      }
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
