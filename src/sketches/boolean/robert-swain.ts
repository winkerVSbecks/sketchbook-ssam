import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { wrap } from 'canvas-sketch-util/math';
import { invert } from '../../colors/rybitten';
import { getRect, makeGrid } from '../../grid';

const config = {
  cols: 4,
  rows: 3,
  gap: [25, 25],
};

const basePalette = [
  '#334E87',
  '#16344A',
  '#C3291D',
  '#8C3774',
  '#377D74',
  '#91B268',
  '#D2C641',
  '#66B8CD',
  '#B5DAD9',
  '#DDE6CE',
  '#B0D5F0',
  '#DCE9F1',
  '#F4F3F5',
  '#E76F51',
  '#F4A261',
];
const inversePalette = basePalette.map(invert);
const bg = '#fff';

interface Rectangle {
  x: number; // grid column position
  y: number; // grid row position
  w: number; // width in grid cells
  h: number; // height in grid cells
  color: string;
  inverseColor: string;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  // Generate multiple layers of rectangles
  const numRectangles = Random.rangeFloor(8, 15);
  const rectangles: Rectangle[] = [];

  for (let i = 0; i < numRectangles; i++) {
    const colorIndex = Random.rangeFloor(0, basePalette.length);
    const x = Random.rangeFloor(0, config.cols);
    const y = Random.rangeFloor(0, config.rows);
    const maxW = Math.min(Random.rangeFloor(1, 4), config.cols - x);
    const maxH = Math.min(Random.rangeFloor(1, 3), config.rows - y);

    rectangles.push({
      x,
      y,
      w: maxW,
      h: maxH,
      color: basePalette[colorIndex],
      inverseColor: inversePalette[colorIndex],
    });
  }

  // Helper function to check if two rectangles overlap
  const rectanglesOverlap = (r1: Rectangle, r2: Rectangle): boolean => {
    return !(
      r1.x + r1.w <= r2.x ||
      r2.x + r2.w <= r1.x ||
      r1.y + r1.h <= r2.y ||
      r2.y + r2.h <= r1.y
    );
  };

  wrap.render = ({ playhead, frame }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw each rectangle
    rectangles.forEach((rect, index) => {
      // Check if this rectangle overlaps with any previous rectangles
      const hasOverlap = rectangles
        .slice(0, index)
        .some((otherRect) => rectanglesOverlap(rect, otherRect));

      // Use inverse color if there's an overlap, otherwise use normal color
      context.fillStyle = hasOverlap ? rect.inverseColor : rect.color;

      // Get pixel coordinates for the rectangle
      const pixelRect = getRect(
        {
          width,
          height,
          cols: config.cols,
          rows: config.rows,
          gapX: config.gap[0],
          gapY: config.gap[1],
        },
        { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
      );

      context.fillRect(pixelRect.x, pixelRect.y, pixelRect.w, pixelRect.h);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
