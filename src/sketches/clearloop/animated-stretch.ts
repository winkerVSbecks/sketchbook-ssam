import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

const config = {
  res: [15, 15],
  xStretch: 1,
  yStretch: 1,
};

const palette = ['#367565', '#43529F', '#E06D3A', '#EBA98A', '#EBE4C8'];
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

const bg = palette.pop()!;

const drawCell = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) => {
  context.fillStyle = color;
  context.fillRect((x + 1) * w, y * h, w * config.xStretch, h);
  context.fillRect(x * w, (y + 1) * h, w, h * config.yStretch);
  context.fillRect(
    (x + 1 + config.xStretch) * w,
    (y + 1) * h,
    w,
    h * config.yStretch
  );
  context.fillRect(
    (x + 1) * w,
    (y + 1 + config.yStretch) * h,
    w * config.xStretch,
    h
  );
};

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

  const stretches = [
    { x: 1, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    { x: 4, y: 2 },
    { x: 5, y: 2 },
    { x: 6, y: 2 },
    { x: 6, y: 3 },
    { x: 5, y: 3 },
    { x: 4, y: 3 },
    { x: 3, y: 3 },
    { x: 2, y: 2 },
    { x: 1, y: 1 },
  ];

  wrap.render = ({ playhead }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const stretch = Math.floor(playhead * stretches.length) % stretches.length;

    config.xStretch = stretches[stretch].x;
    config.yStretch = stretches[stretch].y;

    const xStep = 1 + config.xStretch;
    const yStep = 1 + config.yStretch;

    palette.forEach((color, i) => {
      for (let x = 0; x < config.res[0]; x += xStep) {
        drawCell(context, x, i * yStep, w, h, color);
      }
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
