import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';

type Block = {
  x: number;
  y: number;
  color: string;
};

const directions = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

export const sketch = ({ wrap, context, width }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let blocks: Block[] = [];
  let hStart = Random.rangeFloor(0, 360);
  const colors = Random.chance(0.5)
    ? generateColors()
    : generateColors2(hStart);

  const w = 100;
  const s = width / w;

  const bg = colors.pop()!;
  const frequency = Random.range(0.01, 0.1);

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      blocks = [];

      for (let idx = 0; idx < w * w; idx++) {
        const x = idx % w;
        const y = Math.floor(idx / w);

        blocks.push({
          x: x,
          y: y,
          color:
            colors[
              Math.floor(Math.abs(Random.noise2D(x, y, 1, 1)) * colors.length)
            ],
        });
      }
    }

    blocks = blocks.map((b) => {
      const dir =
        directions[
          Math.floor(
            // Math.abs(Random.noise3D(b.x, b.y, playhead / 10, frequency, 0.5)) *
            //   directions.length
            Math.abs(Random.noise2D(b.x, b.y, frequency, 1)) * directions.length
          )
        ];
      let x = b.x + dir[0];
      let y = b.y + dir[1];

      x = x < 0 ? w - 1 : x;
      x = x > w - 1 ? 0 : x;
      y = y < 0 ? w - 1 : y;
      y = y > w - 1 ? 0 : y;

      return {
        ...b,
        x,
        y,
      };
    });

    blocks.forEach((block) => {
      context.fillStyle = block.color;
      context.fillRect(block.x * s, block.y * s, s, s);
    });
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

// Colors
function generateColors2(hStart: number) {
  const s = 0.6; // 0.2, 0.4, 0.6, 0.8
  const l = 0.6; // 0.2, 0.4, 0.6, 0.8

  const colors = generateColorRamp({
    total: 24,
    hStart,
    hEasing: (x) => x,
    hCycles: 1 / 3,
    sRange: [0.2, 0.8], // [s, s],
    lRange: [0.2, 0.8], // [l, l], // [0.2, 0.6],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'hsl'));

  return colors;
}
