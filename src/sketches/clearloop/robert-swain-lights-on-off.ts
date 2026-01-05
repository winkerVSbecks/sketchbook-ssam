import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { wrap } from 'canvas-sketch-util/math';
import { invert } from '../../colors/rybitten';

const config = {
  res: [15, 15],
};

const basePalette = [
  '#334E87',
  '#16344A',
  '#C3291D',
  '#8C3774',
  [
    ['#377D74', '#91B268', '#D2C641'],
    ['#66B8CD', '#B5DAD9', '#DDE6CE'],
    ['#B0D5F0', '#DCE9F1', '#F4F3F5'],
  ],
  '#E76F51',
  '#F4A261',
];
const inversePalette = basePalette.map((color) =>
  Array.isArray(color)
    ? color.map((c) => c.map(invert))
    : (invert(color) as string)
);
let palette = basePalette;
const bg = '#fff';

const wY = (y: number) => wrap(y, 0, config.res[1]);

const layers = [
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[0] as string;
      context.fillRect(x * w, wY(y) * h, w * 3, h * 6);
      context.fillRect(x * w, wY(y) * h, w * 3, h);
      context.fillRect(x * w, wY(y + 1) * h, w * 3, h);
      context.fillRect(x * w, wY(y + 2) * h, w * 3, h);
      context.fillRect(x * w, wY(y + 3) * h, w * 3, h);
      context.fillRect(x * w, wY(y + 4) * h, w * 3, h);
      context.fillRect(x * w, wY(y + 5) * h, w * 3, h);
    },
    xStep: 2,
    y: 0,
  },
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[1] as string;
      context.fillRect((x + 1) * w, wY(y) * h, w, h);
      context.fillRect(x * w, wY(y + 1) * h, w, h);
      context.fillRect((x + 2) * w, wY(y + 1) * h, w, h);
      context.fillRect((x + 1) * w, wY(y + 2) * h, w, h);
    },
    xStep: 2,
    y: 3,
  },
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[2] as string;
      context.fillRect(x * w, wY(y) * h, w * 3, h * 6);
      context.fillRect(x * w, wY(y) * h, w * 4, h);
      context.fillRect(x * w, wY(y + 1) * h, w * 4, h);
      context.fillRect(x * w, wY(y + 2) * h, w * 4, h);
      context.fillRect(x * w, wY(y + 3) * h, w * 4, h);
      context.fillRect(x * w, wY(y + 4) * h, w * 4, h);
      context.fillRect(x * w, wY(y + 5) * h, w * 4, h);
    },
    xStep: 4,
    y: 6,
  },
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      context.fillStyle = palette[3] as string;
      context.fillRect((x + 1) * w, wY(y) * h, w, h);
      context.fillRect(x * w, wY(y + 1) * h, w, h);
      context.fillRect(x * w, wY(y + 2) * h, w, h);
      context.fillRect((x + 2) * w, wY(y + 1) * h, w, h);
      context.fillRect((x + 2) * w, wY(y + 2) * h, w, h);
      context.fillRect((x + 1) * w, wY(y + 3) * h, w, h);
    },
    xStep: 2,
    y: 7,
  },
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      const colors = palette[4][x / 5] as string[];

      context.fillStyle = colors[0];
      context.fillRect(x * w, wY(y) * h, w * 5, h * 3);
      context.fillRect(x * w, wY(y) * h, w * 5, h);
      context.fillRect(x * w, wY(y + 1) * h, w * 5, h);
      context.fillRect(x * w, wY(y + 2) * h, w * 5, h);
      context.fillStyle = colors[1];
      context.fillRect((x + 2) * w, wY(y) * h, w, h);
      context.fillRect((x + 1) * w, wY(y + 1) * h, w, h);
      context.fillRect((x + 3) * w, wY(y + 1) * h, w, h);
      context.fillRect((x + 2) * w, wY(y + 2) * h, w, h);
      context.fillStyle = colors[2];
      context.fillRect((x + 2) * w, wY(y + 1) * h, w, h);
    },
    xStep: 5,
    y: 12,
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

  document.onclick = () => {
    palette = palette === basePalette ? inversePalette : basePalette;
  };

  wrap.render = ({ playhead, frame }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    const yOffset = playhead * config.res[1];

    if (frame === 0) {
      palette = basePalette;
    } else if (frame === 120) {
      palette = palette === basePalette ? inversePalette : basePalette;
    }

    layers.forEach((layer) => {
      for (let x = 0; x < config.res[0]; x += layer.xStep) {
        layer.cell(context, x, layer.y + yOffset, w, h);
      }
    });

    for (let x = 0; x < config.res[0]; x += 2) {
      context.fillStyle = palette[5] as string;
      context.fillRect(x * w, 0, w, h);
      context.fillStyle = palette[6] as string;
      context.fillRect((x + 1) * w, 0, w, h);

      context.fillStyle = palette[5] as string;
      context.fillRect(x * w, (config.res[1] - 1) * h, w, h);
      context.fillStyle = palette[6] as string;
      context.fillRect((x + 1) * w, (config.res[1] - 1) * h, w, h);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
