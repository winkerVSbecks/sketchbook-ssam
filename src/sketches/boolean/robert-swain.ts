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

  // Layer 2: Single rectangle that can be positioned anywhere (not grid-aligned)
  const colorIndex = Random.rangeFloor(0, basePalette.length);
  const layer2Rectangle: Rectangle = {
    x: Random.range(0, config.cols - 2),
    y: Random.range(0, config.rows - 1),
    w: Random.range(2, 5),
    h: Random.range(1, 2.5),
    color: basePalette[colorIndex],
    inverseColor: inversePalette[colorIndex],
  };

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

    // Draw Layer 2: Single rectangle (not grid-aligned)
    context.fillStyle = layer2Rectangle.color;

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
        x: layer2Rectangle.x,
        y: layer2Rectangle.y,
        w: layer2Rectangle.w,
        h: layer2Rectangle.h,
      }
    );

    context.fillRect(
      layer2PixelRect.x,
      layer2PixelRect.y,
      layer2PixelRect.w,
      layer2PixelRect.h
    );

    // Draw inverse color for overlapping sub-areas
    layer1Rectangles.forEach((rect1) => {
      // Calculate intersection in grid coordinates
      const intersectX = Math.max(rect1.x, layer2Rectangle.x);
      const intersectY = Math.max(rect1.y, layer2Rectangle.y);
      const intersectRight = Math.min(
        rect1.x + rect1.w,
        layer2Rectangle.x + layer2Rectangle.w
      );
      const intersectBottom = Math.min(
        rect1.y + rect1.h,
        layer2Rectangle.y + layer2Rectangle.h
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
