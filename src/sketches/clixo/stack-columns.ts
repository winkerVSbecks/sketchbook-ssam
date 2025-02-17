import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clrs } from '../../colors/clrs';
import { drawClixo } from './draw-clixo';

const colors = Random.pick(clrs);
const bg = colors.pop();
const [ring, inner, ...bases] = Random.shuffle(colors);

const config = {
  xCount: 6,
  yCount: 6,
};

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

    const grid = [];

    for (let i = -2; i < res[0]; i++) {
      for (let j = 0; j < res[1]; j++) {
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
      if (x % 4 === 0) {
        drawClixo(
          context,
          cx,
          cy,
          r,
          y % 2 === 0
            ? { ring, inner, base: bases[0] }
            : { ring, inner, base: bases[1] }
        );
      }
    });

    grid.forEach(({ x, y, cx, cy }) => {
      if ((x - 2) % 4 === 0 && y < 1) {
        drawClixo(context, cx, cy, r, { ring, inner, base: bases[2] });
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
