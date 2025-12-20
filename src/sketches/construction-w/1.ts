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

const createToggleButton = (onToggle: () => void) => {
  const button = document.createElement('button');
  button.textContent = 'Toggle Grid';
  button.style.position = 'fixed';
  button.style.top = '20px';
  button.style.right = '20px';
  button.style.padding = '10px 20px';
  button.style.cursor = 'pointer';
  button.style.zIndex = '1000';
  button.style.fontFamily = 'sans-serif';
  button.style.fontSize = '14px';
  button.style.border = '2px solid #EC776E';
  button.style.background = '#fff';
  button.style.color = '#EC776E';
  button.style.borderRadius = '4px';
  button.addEventListener('click', onToggle);
  document.body.appendChild(button);
  return button;
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  // Grid toggle state
  let showGrid = true;

  // Create toggle button
  createToggleButton(() => {
    showGrid = !showGrid;
    wrap.render();
  });

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  const rects = palette.map((color) => {
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

    return rect;
  });

  wrap.render = () => {
    context.fillStyle = '#F0F0F0';
    context.fillRect(0, 0, width, height);

    rects.forEach((rect, i) => {
      context.fillStyle = palette[i];
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
    });

    if (showGrid) {
      context.lineWidth = 2;
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
    }
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
