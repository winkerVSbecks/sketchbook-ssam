import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { formatCss, oklch } from 'culori';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { logColors } from '../../colors';

const config = {
  res: [13, 15],
  xStretch: 5,
  yStretch: 2,
};

const palette = ['#367565', '#43529F', '#E06D3A', '#EBA98A', '#EBE4C8'];
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
const xStep = 1 + config.xStretch;
const yStep = 1 + config.yStretch;

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
    palette.forEach((color, i) => {
      for (let x = 0; x < config.res[0]; x += xStep) {
        drawCell(context, x, i * yStep, w, h, color);
      }
    });
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
