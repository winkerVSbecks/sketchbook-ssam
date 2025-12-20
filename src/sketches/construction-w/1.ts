import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { createPalette } from '../../colors/rybitten';
import { getRect, makeGrid } from '../../grid';

let h = Random.range(0, 360);
const s = Random.range(0.25, 0.75);
const l = Random.range(0.5, 0.75);

// Configuration
const config = {
  colorCount: 6,
  cols: 4,
  rows: 3,
  gap: [25, 25],
};

const palette = createPalette(
  Array.from({ length: config.colorCount }, (_, i) => [
    (h + (360 / config.colorCount) * i) % 360,
    s,
    l,
  ])
);

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

  wrap.render = () => {
    context.fillStyle = '#F0F0F0';
    context.fillRect(0, 0, width, height);

    palette.forEach((color) => {
      const x = Random.rangeFloor(0, config.cols);
      const y = Random.rangeFloor(0, config.rows);
      const w = Random.rangeFloor(1, config.cols - x);
      const h = Random.rangeFloor(1, config.rows - y);
      const rect = getRect(
        {
          width: width,
          height: height,
          cols: config.cols,
          rows: config.rows,
          gapX: config.gap[0],
          gapY: config.gap[1],
        },
        { x, y, w, h }
      );

      context.fillStyle = color;
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
    });

    // context.lineWidth = 2;
    context.strokeStyle = '#EC776E';
    grid.forEach((cell) => {
      const px = cell.x + cell.width / 2;
      const py = cell.y + cell.height / 2;

      context.strokeRect(
        px - cell.width / 2,
        py - cell.height / 2,
        cell.width,
        cell.height
      );
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [800, 600],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
