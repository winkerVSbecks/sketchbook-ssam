import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clrs } from '../../colors/clrs';
import { drawAnimatedClixo } from './draw-clixo';

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

  wrap.render = ({ width, height, playhead }: SketchProps) => {
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

    const t = Math.sin(playhead * Math.PI);

    grid.forEach(({ x, y, cx, cy }) => {
      if (x % 4 === 0) {
        drawAnimatedClixo(
          context,
          cx,
          cy,
          r,
          y % 2 === 0
            ? { ring, inner, base: bases[0] }
            : { ring, inner, base: bases[1] },
          t
        );
      }
    });

    // grid.forEach(({ x, y, cx, cy }) => {
    //   if ((x - 2) % 4 === 0 && y < 1) {
    //     drawAnimatedClixo(
    //       context,
    //       cx,
    //       cy,
    //       r,
    //       { ring, inner, base: bases[2] },
    //       t
    //     );
    //   }
    // });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
