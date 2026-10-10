import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { cuspPalette } from '../../colors/cusphanger';

// rubber-band-stipple/shape's drifting hulls, no longer painted in stacking
// order. Each hull is rasterised on its own into a coarse cell grid and
// XORed into one parity buffer: a cell is inked when an odd number of hulls
// cover it and cancels back to ground when an even number do.

interface Vec2 {
  x: number;
  y: number;
}
interface Circle {
  x: number;
  y: number;
  r: number;
}

const config = {
  layers: 7,
  count: 6,
  minR: 14,
  maxR: 90,
  drift: 0.05,
  hullSamples: 360,
  cell: 4,
};

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = cuspPalette({ ground: 'light', count: 1, saturation: 0.5 });
  const ground = hexToRgb(palette.bg.hex);
  const ink = hexToRgb(palette.tiers.high[0].hex);

  const cols = Math.floor(width / config.cell);
  const rows = Math.floor(height / config.cell);
  const parity = new Uint8Array(cols * rows);

  // Each hull is filled on a small offscreen canvas at cell resolution, read
  // back and toggled into the shared buffer.
  const mask = document.createElement('canvas');
  mask.width = cols;
  mask.height = rows;
  const mctx = mask.getContext('2d', { willReadFrequently: true })!;
  const out = document.createElement('canvas');
  out.width = cols;
  out.height = rows;
  const octx = out.getContext('2d')!;
  const image = octx.createImageData(cols, rows);

  // Each hull gathers its pegs in its own disc of the canvas, so the hulls
  // differ in size and place and their overlaps stack to different depths.
  const driftAmt = width * config.drift;
  const layers: Vec2[][] = Array.from({ length: config.layers }, () => {
    const reach = Random.range(0.16, 0.3) * width;
    const edge = reach + config.maxR * 0.5 + driftAmt;
    const cx = Random.range(edge, width - edge);
    const cy = Random.range(edge, height - edge);
    const minDist = (reach / Math.sqrt(config.count)) * 0.9;
    const pts: Vec2[] = [];
    for (let a = 0; pts.length < config.count && a < config.count * 80; a++) {
      const [ox, oy] = Random.insideCircle(reach);
      const p = { x: cx + ox, y: cy + oy };
      if (!pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < minDist)) pts.push(p);
    }
    return pts;
  });

  // Closed noise loop in time so radii and drift repeat every duration.
  const noise = (x: number, y: number, t: number): number => {
    const a = Math.PI * 2 * t;
    return Random.noise4D(x / 160, y / 160, Math.cos(a) * 0.7, Math.sin(a) * 0.7);
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    parity.fill(0);
    const s = 1 / config.cell;

    layers.forEach((pts, layer) => {
      const off = layer * 1000;
      const circles: Circle[] = pts.map((p) => ({
        x: p.x + noise(p.x + off + 500, p.y + off, playhead) * driftAmt,
        y: p.y + noise(p.x + off, p.y + off + 500, playhead) * driftAmt,
        r: mapRange(noise(p.x + off, p.y + off, playhead), -1, 1, config.minR, config.maxR, true),
      }));
      const hull = hullOfCircles(circles, config.hullSamples);
      if (hull.length < 2) return;

      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(0, 0, cols, rows);
      mctx.setTransform(s, 0, 0, s, 0, 0);
      mctx.fillStyle = '#000';
      mctx.fill(rubberBandPath(hull));
      const alpha = mctx.getImageData(0, 0, cols, rows).data;
      for (let i = 0; i < parity.length; i++) if (alpha[i * 4 + 3] > 127) parity[i] ^= 1;
    });

    const d = image.data;
    for (let i = 0; i < parity.length; i++) {
      const c = parity[i] ? ink : ground;
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = 255;
    }
    octx.putImageData(image, 0, 0);

    context.fillStyle = palette.bg.hex;
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    context.drawImage(out, 0, 0, cols * config.cell, rows * config.cell);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 1,
  animate: true,
  duration: 10000,
  framesFormat: ['mp4'],
  playFps: 30,
  exportFps: 30,
};

ssam(sketch as Sketch<'2d'>, settings);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// --- rubber band (from rubber-band-stipple/shape) ------------------------------

function tangentPoints(c1: Circle, c2: Circle): { t1: Vec2; t2: Vec2 } {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / d;
  const uy = dy / d;
  const a = (c1.r - c2.r) / d;
  const b = Math.sqrt(Math.max(0, 1 - a * a));
  const nx = a * ux + b * uy;
  const ny = a * uy - b * ux;
  return {
    t1: { x: c1.x + nx * c1.r, y: c1.y + ny * c1.r },
    t2: { x: c2.x + nx * c2.r, y: c2.y + ny * c2.r },
  };
}

function rubberBandPath(circles: Circle[]): Path2D {
  const path = new Path2D();
  const n = circles.length;
  const edges = circles.map((c, i) => tangentPoints(c, circles[(i + 1) % n]));
  const first = edges[n - 1].t2;
  path.moveTo(first.x, first.y);
  for (let i = 0; i < n; i++) {
    const c = circles[i];
    const arrive = edges[(i - 1 + n) % n].t2;
    const depart = edges[i].t1;
    path.arc(
      c.x,
      c.y,
      c.r,
      Math.atan2(arrive.y - c.y, arrive.x - c.x),
      Math.atan2(depart.y - c.y, depart.x - c.x),
      false,
    );
    path.lineTo(edges[i].t2.x, edges[i].t2.y);
  }
  path.closePath();
  return path;
}

// Convex hull of disks via the support function: walking direction θ round
// the circle, the disk with the largest projection + radius wins each θ, and
// each disk wins one contiguous range, giving the hull's disks in order.
function hullOfCircles(circles: Circle[], samples: number): Circle[] {
  const ordered: number[] = [];
  let last = -1;
  for (let s = 0; s < samples; s++) {
    const th = (s / samples) * Math.PI * 2;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    let best = 0;
    let bestVal = -Infinity;
    circles.forEach((c, i) => {
      const v = c.x * cos + c.y * sin + c.r;
      if (v > bestVal) {
        bestVal = v;
        best = i;
      }
    });
    if (best !== last) {
      ordered.push(best);
      last = best;
    }
  }
  if (ordered.length > 1 && ordered[0] === ordered[ordered.length - 1]) ordered.pop();
  return ordered.map((i) => circles[i]);
}
