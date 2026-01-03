import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

const padding = 2;

const config = {
  colorCount: 6,
  res: 24 + padding * 2,
  grid: true,
  padding,
};

const bg = '#fff'; //rybHslToCSS([h, 0, 1]); //'#F0F0F0';

// 3, 5, 8, 13

// w = 13+5+3 = 21
// h = 13+8
//      5
//   8 13 3

const palette = ColorPaletteGenerator.generate(
  { l: Random.range(0, 1), c: Random.range(0, 0.4), h: Random.range(0, 360) },
  Random.pick([
    'analogous',
    'complementary',
    'triadic',
    'tetradic',
    'splitComplementary',
    'tintsShades',
  ]),
  {
    style: Random.pick(['default', 'square', 'triangle', 'circle', 'diamond']),
    modifiers: {
      sine: Random.range(-1, 1),
      wave: Random.range(-1, 1),
      zap: Random.range(-1, 1),
      block: Random.range(-1, 1),
    },
  }
).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

logColors(palette);

const rects = [
  {
    x: 8 + padding,
    y: 0 + padding,
    width: 13,
    height: 5,
    color: palette[0],
    // color: rybHslToCSS([5 * 5, s, l]), // 'blue',
  },
  {
    x: 0 + padding,
    y: 5 + padding,
    width: 8,
    height: 8,
    color: palette[1],
    // color: rybHslToCSS([30, s, l]), // 'red',
  },
  {
    x: 8 + padding,
    y: 5 + padding,
    width: 13,
    height: 13,
    color: palette[2],
    // color: rybHslToCSS([13 * 13, s, l]), // 'green',
  },
  {
    x: 21 + padding,
    y: 5 + padding,
    width: 3,
    height: 19,
    color: palette[3],
    // color: rybHslToCSS([3 * 3, s, l]), // 'yellow',
  },
  // {
  //   x: 1,
  //   y: 22,
  //   width: 21,
  //   height: 3,
  //   color: rybHslToCSS([21 * 21, s, l]), // 'yellow',
  // },
];

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const s = width / config.res;

    context.fillStyle = `rgba(0 0 0 / 0.01)`;
    context.fillRect(s, s, width - 2 * s, height - 2 * s);

    if (config.grid) {
      // draw grid
      context.strokeStyle = `oklch(from ${
        palette[palette.length - 1]
      } l c h / 0.01)`;
      console.log(`rgb(from ${palette[palette.length - 1]} r g b / 0.1)`);

      context.lineWidth = 1;
      for (let y = s; y < height - s; y += s) {
        for (let x = s; x < width - s; x += s) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(width - 0, y);
          context.stroke();

          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, height - 0);
          context.stroke();
        }
      }
    }

    rects.forEach((r) => {
      context.fillStyle = r.color;
      context.fillRect(r.x * s, r.y * s, r.width * s, r.height * s);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
