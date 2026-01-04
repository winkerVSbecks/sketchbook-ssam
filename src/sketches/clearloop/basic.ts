import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

const config = {
  res: [11, 13],
};

const palette = ['#367565', '#43529F', '#E06D3A', '#EBA98A', '#EBE4C8'];
const bg = palette.pop()!;

const layers = [
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
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[3];
      context.fillRect((x + 1) * w, y * h, w, h);
      context.fillRect(x * w, (y + 1) * h, w, h);
      context.fillRect((x + 1) * w, (y + 2) * h, w, h);
      context.fillRect(x * w, (y + 3) * h, w, h);
    },
    xStep: 2,
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

    layers.forEach((layer, i) => {
      for (let x = 0; x < config.res[0]; x += layer.xStep) {
        layer.cell(context, x, i * 3, w, h);
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
