import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

const config = {
  res: [11, 13],
};

// const bg = '#111';
// const fg = '#fefefe';

// const palette = ColorPaletteGenerator.generate(
//   { l: Random.range(0, 1), c: Random.range(0, 0.4), h: Random.range(0, 360) },
//   Random.pick([
//     'analogous',
//     'complementary',
//     'triadic',
//     'tetradic',
//     'splitComplementary',
//     'tintsShades',
//   ]),
//   {
//     style: Random.pick(['default', 'square', 'triangle', 'circle', 'diamond']),
//     modifiers: {
//       sine: Random.range(-1, 1),
//       wave: Random.range(-1, 1),
//       zap: Random.range(-1, 1),
//       block: Random.range(-1, 1),
//     },
//   }
// ).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

// logColors(palette);

const palette = ['#367565', '#43529F', '#E06D3A', '#EBE4C8'];
const bg = palette.pop()!;

// Define pattern: [fillOdd, height, yIncrement]
const layers: [boolean, number, number][][] = [
  [
    [true, 1, 1], // Odd columns, height 1h, move 1 row
    [false, 2, 2], // Even columns, height 2h, move 2 rows
    [true, 1, 1], // Odd columns, height 1h, move 1 row
  ],
  [
    [true, 1, 1],
    [false, 2, 2],
    [true, 0, 0],
  ],
  [
    [true, 1, 1],
    [false, 2, 2],
    [true, 0, 0],
  ],
];

const layers2 = [
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[0];
      context.fillRect((x + 1) * w, y * h, w, h);
      context.fillRect(x * w, (y + 1) * h, w, h * 2);
      context.fillRect((x + 2) * w, (y + 1) * h, w, h * 2);
      context.fillRect((x + 1) * w, (y + 3) * h, w, h);
    },
    xStep: 2,
  },
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[1];
      context.fillRect((x + 1) * w, y * h, w, h);
      context.fillRect(x * w, (y + 1) * h, w, h * 2);
      context.fillRect((x + 2) * w, (y + 1) * h, w, h * 2);
      context.fillRect((x + 1) * w, (y + 3) * h, w, h);
    },
    xStep: 4,
  },
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[2];
      context.fillRect((x + 1) * w, y * h, w, h);
      context.fillRect(x * w, (y + 1) * h, w, h * 2);
      context.fillRect((x + 2) * w, (y + 1) * h, w, h * 2);
      context.fillRect((x + 1) * w, (y + 3) * h, w, h);
    },
    xStep: 4,
  },
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

  const w = width / config.res[0];
  const h = height / config.res[1];

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    layers2.forEach((layer, i) => {
      for (let x = 0; x < config.res[0]; x += layer.xStep) {
        layer.cell(context, x, i * 3, w, h);
      }
    });

    // palette.forEach((color, i) => {
    //   context.fillStyle = color;

    //   // Define pattern: [fillOdd, height, yIncrement]
    //   const rows = layers[i];

    //   let y = i * 3;
    //   rows.forEach(([fillOdd, heightMultiplier, yIncrement]) => {
    //     for (let x = 0; x < config.res[0]; x++) {
    //       if ((x % 2 !== 0) === fillOdd) {
    //         context.fillRect(x * w, y * h, w, h * heightMultiplier);
    //       }
    //     }
    //     y += yIncrement;
    //   });
    // });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600, 800],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
