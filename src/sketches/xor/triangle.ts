import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { lerp } from 'canvas-sketch-util/math';
import { makeGrid } from '../../grid';

const config = {
  cols: 128 * 2,
  rows: 128 * 2,
  gap: [0, 0],
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

  wrap.render = ({ playhead }) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    pixels = grid.map((cell) => ({
      ...cell,
      value: 0,
    }));

    const [cx, cy] = [Math.floor(config.cols / 2), Math.floor(config.rows / 2)];

    const angleOffset = 2 * Math.PI * playhead;

    const triangle = Array.from({ length: 3 }, (_, i) => [
      cx + Math.floor(Math.cos((i / 3) * 2 * Math.PI + angleOffset) * 64),
      cy + Math.floor(Math.sin((i / 3) * 2 * Math.PI + angleOffset) * 64),
    ]) as [number, number][];

    for (let i = 0; i <= 50; i++) {
      drawLine(triangle[0], [
        Math.floor(lerp(triangle[1][0], triangle[2][0], i / 50)),
        Math.floor(lerp(triangle[1][1], triangle[2][1], i / 50)),
      ]);
    }

    pixels.forEach((pixel) => {
      context.fillStyle = pixel.value === 1 ? '#000' : '#fff';
      context.fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 24,
  exportFps: 24,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
