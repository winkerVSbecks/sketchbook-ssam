import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { wrap } from 'canvas-sketch-util/math';
import { invert } from '../../colors/rybitten';
import { getRect, makeGrid } from '../../grid';

const config = {
  cols: 12,
  rows: 4,
  gap: [0, 0],
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
const bg = '#ccc';

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
  // Random.setSeed(seed);
  Random.setSeed('#ffff');
  console.log('Seed:', seed);

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  // Layer 1: Generate rectangles that fill the entire screen
  const layer1Rectangles: Rectangle[] = [];

  // Create random rectangles that together fill the screen
  let currentX = 0;
  for (let row = 0; row < config.rows; row++) {
    currentX = 0;
    while (currentX < config.cols) {
      const colorIndex = Random.rangeFloor(0, basePalette.length);
      const maxW = Math.min(Random.rangeFloor(2, 5), config.cols - currentX);

      layer1Rectangles.push({
        x: currentX,
        y: row,
        w: maxW,
        h: 1,
        color: basePalette[colorIndex],
        inverseColor: inversePalette[colorIndex],
      });

      currentX += maxW;
    }
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

  // Layer 2: Multiple rectangles that can be positioned anywhere (not grid-aligned)
  const numLayer2Rects = Random.rangeFloor(4, 7);
  const layer2Rectangles: Rectangle[] = [];

  for (let i = 0; i < numLayer2Rects; i++) {
    let attempts = 0;
    let newRect: Rectangle;
    let overlaps = true;

    // Try to find a non-overlapping position
    while (overlaps && attempts < 100) {
      const colorIndex = Random.rangeFloor(0, basePalette.length);
      newRect = {
        x: Random.range(1, config.cols - 2),
        y: Random.range(1, config.rows - 2),
        w: Random.range(2, 3),
        h: Random.range(1, 2.5),
        color: basePalette[colorIndex],
        inverseColor: inversePalette[colorIndex],
      };

      // Check if this rectangle overlaps with any existing layer 2 rectangles
      overlaps = layer2Rectangles.some((existingRect) =>
        rectanglesOverlap(newRect, existingRect)
      );

      attempts++;
    }

    // Only add if we found a non-overlapping position
    if (!overlaps) {
      layer2Rectangles.push(newRect!);
    }
  }

  wrap.render = ({ playhead, frame }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw Layer 1: Base rectangles that fill the screen
    layer1Rectangles.forEach((rect) => {
      context.fillStyle = rect.color;

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

    // Draw Layer 2: Multiple rectangles (not grid-aligned)
    layer2Rectangles.forEach((layer2Rect) => {
      context.fillStyle = layer2Rect.color;

      const layer2PixelRect = getRect(
        {
          width,
          height,
          cols: config.cols,
          rows: config.rows,
          gapX: config.gap[0],
          gapY: config.gap[1],
        },
        {
          x: layer2Rect.x,
          y: layer2Rect.y,
          w: layer2Rect.w,
          h: layer2Rect.h,
        }
      );

      context.fillRect(
        layer2PixelRect.x,
        layer2PixelRect.y,
        layer2PixelRect.w,
        layer2PixelRect.h
      );
    });

    // Draw inverse color for overlapping sub-areas
    layer2Rectangles.forEach((layer2Rect) => {
      layer1Rectangles.forEach((rect1) => {
        // Calculate intersection in grid coordinates
        const intersectX = Math.max(rect1.x, layer2Rect.x);
        const intersectY = Math.max(rect1.y, layer2Rect.y);
        const intersectRight = Math.min(
          rect1.x + rect1.w,
          layer2Rect.x + layer2Rect.w
        );
        const intersectBottom = Math.min(
          rect1.y + rect1.h,
          layer2Rect.y + layer2Rect.h
        );
        const intersectW = intersectRight - intersectX;
        const intersectH = intersectBottom - intersectY;

        // If there's an overlap, draw it
        if (intersectW > 0 && intersectH > 0) {
          context.fillStyle = rect1.inverseColor;

          const pixelRect = getRect(
            {
              width,
              height,
              cols: config.cols,
              rows: config.rows,
              gapX: config.gap[0],
              gapY: config.gap[1],
            },
            { x: intersectX, y: intersectY, w: intersectW, h: intersectH }
          );

          context.fillRect(pixelRect.x, pixelRect.y, pixelRect.w, pixelRect.h);
        }
      });
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [800, 600],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
