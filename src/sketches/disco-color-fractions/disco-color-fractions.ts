import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';

type Block = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  row: number;
  col: number;
};

const FRACTIONS = 8;
const MIRROR = false;

export const sketch = ({ wrap, context, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const generateRow = (
    size: number,
    _y: number,
    parts: number,
    colors: string[]
  ): Block[] => {
    let row: Block[] = [];
    const sliceSize = size / parts;

    let colorIdx = 0;
    for (let _x = 0; _x < FRACTIONS; _x++) {
      for (let slice = 0; slice < parts; slice++) {
        const color = colors[colorIdx % colors.length];

        const x = _x * size + slice * sliceSize;
        const y = _y * size;
        const flip = _x % 2 !== 0;

        row.push({
          x: flip ? _x * size : x,
          y: flip ? _y * size + slice * sliceSize : y,
          width: flip ? size : sliceSize,
          height: flip ? sliceSize : size,
          color: color,
          col: colorIdx,
          row: _y,
        });
        colorIdx++;
      }
    }

    return row;
  };

  const step = height / FRACTIONS;

  const generateBlocks = (colors: string[]) => {
    const blocks: Block[] = [];
    for (let y = 0; y < FRACTIONS; y++) {
      const parts = MIRROR
        ? y >= Math.floor(FRACTIONS / 2)
          ? FRACTIONS - y
          : y + 1
        : y + 1;

      let row = generateRow(step, y, parts, colors);
      blocks.push(...row);
    }
    return blocks;
  };

  let blocks: Block[] = [];

  let hStart = Random.rangeFloor(0, 360);

  wrap.render = ({ width, height, frame, totalFrames }: SketchProps) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    if (frame % 5 === 0) {
      const step = 360 / (totalFrames / 5);
      const colors = generateColors((hStart += step));
      blocks = generateBlocks(colors);
    }

    blocks.forEach((block) => {
      context.fillStyle = block.color;
      context.fillRect(block.x, block.y, block.width, block.height);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

// Colors
function generateColors(hStart: number) {
  const s = 0.6; // 0.2, 0.4, 0.6, 0.8
  const l = 0.6; // 0.2, 0.4, 0.6, 0.8

  const colors = generateColorRamp({
    total: FRACTIONS,
    hStart,
    hEasing: (x) => x,
    hCycles: 1 / 3,
    sRange: [s, s],
    lRange: [l, l], // [0.2, 0.6],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'oklch'));

  return colors;
}
