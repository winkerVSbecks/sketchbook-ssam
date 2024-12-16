import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clrs } from '../colors/clrs';
import { drawClixo } from './draw-clixo';

const colors = Random.pick(clrs);
const bg = colors.pop();
const [ring, inner, ...bases] = Random.shuffle(colors);

const config = {
  xCount: 6,
  yCount: 6,
  trim: true,
};

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
      x: [config.trim ? 0 : -2, config.trim ? res[0] - 1 : res[0]],
      y: [config.trim ? 0 : -2, config.trim ? res[1] - 1 : res[1]],
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
      if (y % 2 === 0) {
        if (x % 2 === 0) {
          drawClixo(
            context,
            cx,
            cy,
            r,
            x % 4 === 0
              ? { ring, inner, base: bases[1] }
              : { ring, inner, base: bases[0] }
          );
        }

        if (y % 4 === 0) {
          if (x % 2 === 0) {
            drawClixo(
              context,
              cx,
              cy,
              r,
              x % 4 === 0
                ? { ring, inner, base: bases[0] }
                : { ring, inner, base: bases[1] }
            );
          }
        }
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
