import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import pack from 'pack-spheres';
import { mapRange } from 'canvas-sketch-util/math';
import { makeGrid } from '../../grid';

const config = {
  cols: 128 * 2,
  rows: 128 * 2,
  gap: [0, 0],
  steps: 10,
  spread: Math.PI * 0.25,
};

const bg = '#000';
const fg = '#fff';

function xor(a: number, b: number) {
  return (a || b) && !(a && b);
}

interface Lissajous {
  center: [number, number];
  r: number;
  vel: [number, number];
  start: [number, number];
  paths: Line[];
}

function lissajous({
  center,
  r,
  vel = [9, 8],
  start = [-Math.PI / 2, -Math.PI / 2],
}: Omit<Lissajous, 'paths'>): Lissajous {
  return {
    center: center,
    r: r,
    vel: vel,
    start: start,
    paths: [],
  };
}

function update(l: Lissajous, angle: number) {
  const { center, r, vel, start } = l;
  l.paths = [];

  for (let i = 0; i < config.steps; i++) {
    const off = (i / config.steps) * config.spread;

    l.paths.push([
      [
        Math.floor(center[0] + r * Math.cos((angle + off) * vel[0] - start[0])),
        Math.floor(center[1] + r * Math.sin((angle + off) * vel[1] - start[1])),
      ],
      [
        Math.floor(
          center[0] +
            r * Math.cos((angle + Math.PI / 2 + off) * vel[0] - start[0])
        ),
        Math.floor(
          center[1] +
            r * Math.sin((angle + Math.PI / 2 + off) * vel[1] - start[1])
        ),
      ],
    ]);
  }
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

  const shapes = pack({
    dimensions: 2,
    padding: 0.001,
    maxCount: 50,
    packAttempts: 500,
    minRadius: 0.125,
    maxRadius: 0.5,
  });

  const circles = shapes.map((shape: any) => ({
    x: Math.floor(mapRange(shape.position[0], -1, 1, 0, config.cols)),
    y: Math.floor(mapRange(shape.position[1], -1, 1, 0, config.rows)),
    r: (shape.radius * config.cols) / 2,
  }));

  const ls: Lissajous[] = circles.map((circle: any, idx: number) =>
    lissajous({
      center: [circle.x, circle.y],
      r: circle.r,
      vel: [2, 3],
      start: [(Math.PI / 2) * idx, (Math.PI / 2) * idx],
    })
  );

  wrap.render = ({ playhead }) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const angle = playhead * Math.PI * 2;

    pixels = grid.map((cell) => ({
      ...cell,
      value: 0,
    }));

    ls.forEach((l) => {
      update(l, angle);
      l.paths.forEach((path) => {
        drawLine(path[0], path[1]);
      });
    });

    pixels.forEach((pixel) => {
      if (pixel.value === 1) {
        context.fillStyle = fg;
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
  duration: 20_000,
  playFps: 30,
  exportFps: 30,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
