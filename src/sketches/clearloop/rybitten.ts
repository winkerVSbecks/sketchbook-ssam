import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerpFrames } from 'canvas-sketch-util/math';
import { createPalette } from '../../colors/rybitten';
import { logColors } from '../../colors';

const config = {
  res: [11, 13],
};

const palette = createPalette([
  [165, 0.37, 0.34],
  [230, 0.41, 0.44],
  [18, 0.73, 0.55],
  [19, 0.71, 0.73],
  [48, 0.47, 0.85],
]);
logColors(palette);

const bg = palette.pop()!;

const layers = [
  {
    cell: (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      color: string
    ) => {
      context.fillStyle = color;
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
      h: number,
      color: string
    ) => {
      context.fillStyle = color;
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
      h: number,
      color: string
    ) => {
      context.fillStyle = color;
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
      h: number,
      color: string
    ) => {
      context.fillStyle = color;
      context.fillRect((x + 1) * w, y * h, w, h);
      context.fillRect(x * w, (y + 1) * h, w, h);
      context.fillRect((x + 1) * w, (y + 2) * h, w, h);
      context.fillRect(x * w, (y + 3) * h, w, h);
    },
    xStep: 2,
  },
];

const hsla = (h: number, s: number, l: number, a: number = 1) =>
  `hsla(${h}, ${s * 100}%, ${l * 100}%, ${a})`;

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

  wrap.render = ({ playhead }) => {
    // const palette = createPalette([
    //   [lerpFrames([165, 230, 18, 19, 48, 165], playhead), 0.37, 0.34],
    //   [lerpFrames([230, 18, 19, 48, 165, 230], playhead), 0.41, 0.44],
    //   [lerpFrames([18, 19, 48, 165, 230, 18], playhead), 0.73, 0.55],
    //   [lerpFrames([19, 48, 165, 230, 18, 19], playhead), 0.71, 0.73],
    //   [lerpFrames([48, 165, 230, 18, 19, 48], playhead), 0.47, 0.85],
    // ]);

    // const palette = [
    //   lerpFrames(
    //     [
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //     ],
    //     playhead
    //   ),
    // ].map((c) => hsla(c[0], c[1], c[2]));

    // const palette = createPalette([
    //   lerpFrames(
    //     [
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //     ],
    //     playhead
    //   ),
    //   lerpFrames(
    //     [
    //       [48, 0.47, 0.85],
    //       [165, 0.37, 0.34],
    //       [230, 0.41, 0.44],
    //       [18, 0.73, 0.55],
    //       [19, 0.71, 0.73],
    //       [48, 0.47, 0.85],
    //     ],
    //     playhead
    //   ),
    // ]);

    const palette = createPalette([
      [165 + 360 * playhead, 0.37, 0.34],
      [230 + 360 * playhead, 0.41, 0.44],
      [18 + 360 * playhead, 0.73, 0.55],
      [19 + 360 * playhead, 0.71, 0.73],
      [48 + 360 * playhead, 0.47, 0.85],
    ]);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    layers.forEach((layer, i) => {
      for (let x = 0; x < config.res[0]; x += layer.xStep) {
        layer.cell(context, x, i * 3, w, h, palette[i]);
      }
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
