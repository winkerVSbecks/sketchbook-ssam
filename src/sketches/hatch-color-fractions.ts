import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import {
  createHatchLines,
  clipPolylinesToBox,
} from 'canvas-sketch-util/geometry';

type Hatch = [number, number][];

type Block = {
  hatch: Hatch;
  color: string;
  bbox: number[];
};

const FRACTIONS = 8; //4; // Random.pick([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24]);
const MIRROR = false;
const SPACING = 4; //6; // Math.max(4, FRACTIONS / 4);
const DOUBLE_HATCH = false;

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

        const minX = flip ? _x * size : x;
        const minY = flip ? _y * size + slice * sliceSize : y;
        const maxX = minX + (flip ? size : sliceSize);
        const maxY = minY + (flip ? sliceSize : size);
        const bbox = [minX, minY, maxX, maxY];

        const hatch = createHatchLines(
          bbox,
          (_x + slice) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4,
          SPACING,
          null
        ).concat(
          DOUBLE_HATCH
            ? createHatchLines(
                bbox,
                (_x + slice) % 2 !== 0 ? Math.PI / 4 : -Math.PI / 4,
                SPACING,
                null
              )
            : []
        );

        row.push({
          hatch: clipPolylinesToBox(hatch, bbox, false, false),
          color,
          bbox,
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
  let colors: string[];

  wrap.render = ({ width, height, frame, totalFrames }: SketchProps) => {
    if (frame % 5 === 0) {
      const step = 360 / (totalFrames / 5);
      colors = generateColors((hStart += step));
      blocks = generateBlocks(colors);
    }

    // const gradient = context.createLinearGradient(0, 0, width, height);
    // colors.forEach((color, idx) => {
    //   gradient.addColorStop(1 - idx / colors.length, color);
    // });

    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    blocks.forEach((block) => {
      context.strokeStyle = block.color;
      context.lineWidth = SPACING / 3;

      block.hatch.forEach((line: any) => {
        context.beginPath();
        context.moveTo(line[0][0], line[0][1]);
        context.lineTo(line[1][0], line[1][1]);
        context.stroke();
      });

      // const bbox = block.bbox;
      // context.strokeRect(
      //   bbox[0],
      //   bbox[1],
      //   bbox[2] - bbox[0],
      //   bbox[3] - bbox[1]
      // );
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
