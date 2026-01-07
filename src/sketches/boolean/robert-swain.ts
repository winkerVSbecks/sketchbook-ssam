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

  // Layer 2: Generate 4-5 rectangles placed randomly on top
  const numLayer2Rects = Random.rangeFloor(4, 6);
  const layer2Rectangles: Rectangle[] = [];

  for (let i = 0; i < numLayer2Rects; i++) {
    const colorIndex = Random.rangeFloor(0, basePalette.length);
    const x = Random.rangeFloor(0, config.cols);
    const y = Random.rangeFloor(0, config.rows);
    const maxW = Math.min(Random.rangeFloor(2, 5), config.cols - x);
    const maxH = Math.min(Random.rangeFloor(1, 3), config.rows - y);

    layer2Rectangles.push({
      x,
      y,
      w: maxW,
      h: maxH,
      color: basePalette[colorIndex],
      inverseColor: inversePalette[colorIndex],
    });
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

    // Draw Layer 2: Top rectangles
    layer2Rectangles.forEach((rect) => {
      context.fillStyle = `rgba(0 0 0 / 0.5)`; //rect.color;

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

    // // Draw inverse color cells where layer 2 overlaps with layer 1
    // grid.forEach((cell) => {
    //   const layer1Covers = layer1Rectangles.some(
    //     (rect) =>
    //       cell.col >= rect.x &&
    //       cell.col < rect.x + rect.w &&
    //       cell.row >= rect.y &&
    //       cell.row < rect.y + rect.h
    //   );

    //   const layer2Rects = layer2Rectangles.filter(
    //     (rect) =>
    //       cell.col >= rect.x &&
    //       cell.col < rect.x + rect.w &&
    //       cell.row >= rect.y &&
    //       cell.row < rect.y + rect.h
    //   );

    //   // If both layers cover this cell, use inverse color of layer 2
    //   if (layer1Covers && layer2Rects.length > 0) {
    //     const topRect = layer2Rects[layer2Rects.length - 1];
    //     context.fillStyle = topRect.inverseColor;
    //     context.fillRect(cell.x, cell.y, cell.width, cell.height);

    //     context.strokeStyle = '#0f0';
    //     context.strokeRect(cell.x, cell.y, cell.width, cell.height);
    //   }
    // });
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
