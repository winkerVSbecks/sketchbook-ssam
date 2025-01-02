import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clrs } from '../../colors/clrs';
import { drawClixo, drawClixoOutline } from './draw-clixo';

// Random.setSeed('clixo');

const colors = Random.pick(clrs);
const bg = colors.pop();
const [ring, inner, ...bases] = Random.shuffle(colors);

const config = {
  xCount: 7,
  yCount: 7,
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

  wrap.render = (props: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, props.width, props.height);

    const margin = 0.1 * props.width;

    const width = props.width - 2 * margin;
    const height = props.height - 2 * margin;
    const off = [margin, margin];

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
          cx: x + r + off[0],
          cy: y + r + off[1],
        });
      }
    }

    context.lineWidth = 4;

    // Try toggling this on and off
    grid.forEach(({ x, y, cx, cy }) => {
      if (matchesPattern(3, 0, y)) {
        if (x % 2 === 0 && y > 1 && y < 10) {
          drawClixoOutline(context, cx, cy, r, {
            fill: bases[3],
            outline: bases[3], // ring,
          });
        }
      }
    });

    grid.forEach(({ x, y, cx, cy }) => {
      if (matchesPattern(4, 0, y)) {
        if (x % 2 === 0) {
          drawClixo(context, cx, cy, r, { ring, inner, base: bases[0] });
        }
      }

      if (matchesPattern(4, 2, y)) {
        if (x % 2 !== 0) {
          drawClixo(context, cx, cy, r, { ring, inner, base: bases[1] });
        }
      }
    });

    grid.forEach(({ x, y, cx, cy }) => {
      if (matchesPattern(3, 0, y)) {
        if (x % 2 !== 0) {
          drawClixoOutline(context, cx, cy, r, {
            fill: bg,
            outline: bases[3],
            // fill: bg,
            // outline: bases[2],
          });
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
