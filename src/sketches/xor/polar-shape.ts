import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { lerp } from 'canvas-sketch-util/math';
import { makeGrid } from '../../grid';

const config = {
  cols: 128 * 2,
  rows: 128 * 2,
  gap: [0, 0],
  steps: 30,
  sides: 12,
  r: 96,
};

function xor(a: number, b: number) {
  return (a || b) && !(a && b);
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const grid = makeGrid({
    width: width,
    height: height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  let pixels = grid.map((cell) => ({
    ...cell,
    value: 0,
  }));

  function drawLine([x1, y1]: Point, [x2, y2]: Point) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      // Find the cell at (x, y) where x is col and y is row
      const idx = y * config.cols + x;
      if (idx >= 0 && idx < pixels.length) {
        pixels[idx].value = xor(1, pixels[idx].value) ? 1 : 0;
      }

      if (x === x2 && y === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  function drawShape([cx, cy]: Point, playhead: number) {
    const angleOffset = 2 * Math.PI * playhead;

    const shape = Array.from({ length: config.sides }, (_, i) => {
      const angle = (i / config.sides) * 2 * Math.PI + angleOffset;
      return [
        cx + Math.floor(Math.cos(angle) * config.r),
        cy + Math.floor(Math.sin(angle) * config.r),
      ];
    }) as [number, number][];

    for (let i = 1; i < config.sides - 1; i++) {
      for (let step = 0; step <= config.steps; step++) {
        const t = step / config.steps;

        drawLine(shape[i], [
          Math.floor(lerp(shape[i + 1][0], shape[0][0], t)),
          Math.floor(lerp(shape[i + 1][1], shape[0][1], t)),
        ]);
      }
    }
  }

  wrap.render = ({ playhead, frame }) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    pixels = grid.map((cell) => ({
      ...cell,
      value: 0,
    }));

    drawShape([config.cols / 2, config.rows / 2], playhead);

    // shift pixels value by 1 in x direction for next frame
    const originalValues = pixels.map((p) => p.value);
    pixels = pixels.map((pixel) => {
      const dir = frame % 2 === 0 ? 1 : -1;
      const dir2 = pixel.col % 2 === 0 ? dir : -dir;
      const shiftedX = (pixel.col + dir2 * 1) % config.cols;
      const shiftedIdx = pixel.row * config.cols + shiftedX;

      return {
        ...pixel,
        value: originalValues[shiftedIdx],
      };
    });

    pixels.forEach((pixel) => {
      if (pixel.value === 1) {
        context.fillStyle = '#000';
        context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
      }
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 1, //window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 24,
  exportFps: 24,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
