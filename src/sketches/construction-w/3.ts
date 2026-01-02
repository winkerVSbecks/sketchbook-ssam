import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { createPalette, rybHslToCSS } from '../../colors/rybitten';
import { getRect, getRectInGap, makeGrid } from '../../grid';

// Configuration
const config = {
  colorCount: 6,
  rectCount: Random.rangeFloor(8, 12),
  cols: 4 * 2,
  rows: 3 * 2,
  gap: [25, 25],
  showGrid: true,
};

let h = Random.range(0, 360);
const s = Random.range(0.75, 0.9);
const l = Random.range(0.5, 0.75);

const palette = createPalette(
  Array.from({ length: config.colorCount }, (_, i) => [
    (h + (360 / config.colorCount) * i) % 360,
    s,
    l,
  ])
);

const bgColor = rybHslToCSS([h, s, 1]);

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

export const sketch = ({
  wrap,
  context,
  width,
  height,
  render,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  // Create toggle button
  createToggleButton(() => {
    config.showGrid = !config.showGrid;
    render();
  });

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  const gridConfig = {
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  };

  // Generate rectangles aligned to grid
  const rects = Array.from({ length: config.rectCount }, () => {
    // Pick random grid position with center bias
    const gx = Random.rangeFloor(0, config.cols);
    const gy = Random.rangeFloor(0, config.rows);

    // Pick size - mostly 1 column wide, 2-3 rows tall
    const gw = 1;
    const gh = Random.rangeFloor(2, 4);

    const rect = getRect(gridConfig, {
      x: gx,
      y: gy,
      w: gw,
      h: Math.min(gh, config.rows - gy),
    });

    const color = Random.pick(palette);

    return { ...rect, color };
  }).concat([
    {
      ...getRect(gridConfig, { x: 3, y: 2, w: 2, h: 2 }),
      color: '#fff',
    },
  ]);

  wrap.render = () => {
    context.fillStyle = bgColor;
    context.fillRect(0, 0, width, height);

    rects.forEach((rect) => {
      context.fillStyle = rect.color;
      context.fillRect(rect.x, rect.y, rect.w, rect.h);
    });

    if (config.showGrid) {
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
