import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

interface Vec2 { x: number; y: number; }
interface Circle { x: number; y: number; r: number; }

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const grid = makeGrid(width, height);
  let circles: Circle[] = [];

  wrap.render = ({ width, height, frame }: SketchProps) => {
    if (frame === 0) {
      circles = generateLayout(grid, width);
    }

    context.fillStyle = '#0a0a0a';
    context.fillRect(0, 0, width, height);

    // Grid dots
    context.fillStyle = 'rgba(255,255,255,0.5)';
    for (const pt of grid) {
      context.beginPath();
      context.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      context.fill();
    }

    // Rubber band drawn behind circles
    context.strokeStyle = '#ffffff';
    context.lineWidth = 5;
    context.lineJoin = 'round';
    drawRubberBand(context, circles);

    // Circles on top
    context.fillStyle = '#ffffff';
    for (const c of circles) {
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fill();
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);

// --- Layout ---

function makeGrid(width: number, height: number): Vec2[] {
  const size = width * 0.5;
  const step = size / 2;
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;
  const pts: Vec2[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      pts.push({ x: ox + col * step, y: oy + row * step });
    }
  }
  return pts;
}

function generateLayout(grid: Vec2[], width: number): Circle[] {
  const step = (width * 0.5) / 2;
  const minR = step * 0.28;
  const maxR = step * 0.44;
  return pickCircles(grid, minR, maxR);
}

function pickCircles(grid: Vec2[], minR: number, maxR: number): Circle[] {
  const shuffled = Random.shuffle([...grid]);
  const result: Circle[] = [];

  for (const pt of shuffled) {
    if (result.length === 3) break;
    const r = Random.range(minR, maxR);
    const overlaps = result.some(c => Math.hypot(c.x - pt.x, c.y - pt.y) < c.r + r + 15);
    if (!overlaps) {
      result.push({ ...pt, r });
    }
  }

  // Fallback to well-spaced grid points if random placement fails
  if (result.length < 3) {
    return hullCircles([
      { x: grid[0].x, y: grid[0].y, r: minR },
      { x: grid[4].x, y: grid[4].y, r: minR },
      { x: grid[8].x, y: grid[8].y, r: minR },
    ]);
  }

  return hullCircles(result);
}

// Returns circles on the convex hull in clockwise screen order.
// When the 3 centres are collinear the middle circle is dropped so the
// rubber-band algorithm only wraps the two extremes.
function hullCircles(circles: Circle[]): Circle[] {
  const sorted = [...circles].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross =
    (sorted[1].x - sorted[0].x) * (sorted[2].y - sorted[0].y) -
    (sorted[1].y - sorted[0].y) * (sorted[2].x - sorted[0].x);

  const hull = Math.abs(cross) < 1
    ? [sorted[0], sorted[sorted.length - 1]]  // collinear — keep extremes only
    : circles;

  const cx = hull.reduce((s, c) => s + c.x, 0) / hull.length;
  const cy = hull.reduce((s, c) => s + c.y, 0) / hull.length;
  return [...hull].sort((a, b) =>
    Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

// --- Vec2 math ---

function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
function scale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
}
function perpRight(v: Vec2): Vec2 { return { x: v.y, y: -v.x }; }

// --- Rubber band ---

function getTangentPoints(c1: Circle, c2: Circle): { t1: Vec2; t2: Vec2 } {
  const dir = normalize(sub(c2, c1));
  const n = perpRight(dir);
  return {
    t1: add(c1, scale(n, c1.r)),
    t2: add(c2, scale(n, c2.r)),
  };
}

function drawRubberBand(ctx: CanvasRenderingContext2D, circles: Circle[]): void {
  const n = circles.length;
  // Precompute tangent points for every edge
  const edges = circles.map((c, i) => getTangentPoints(c, circles[(i + 1) % n]));

  ctx.beginPath();
  // Start at the arrival point on circle 0 (= t2 of the last edge)
  const firstArrival = edges[n - 1].t2;
  ctx.moveTo(firstArrival.x, firstArrival.y);

  for (let i = 0; i < n; i++) {
    const c = circles[i];
    // Arrival tangent on this circle = t2 of the previous edge
    const arrival = edges[(i - 1 + n) % n].t2;
    // Departure tangent on this circle = t1 of the current edge
    const departure = edges[i].t1;

    const aAngle = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const dAngle = Math.atan2(departure.y - c.y, departure.x - c.x);

    // Arc clockwise on screen (anticlockwise = false) from arrival to departure.
    // Canvas arc implicitly lines from current path point to the arc start.
    ctx.arc(c.x, c.y, c.r, aAngle, dAngle, false);

    // Straight segment to the arrival tangent on the next circle
    ctx.lineTo(edges[i].t2.x, edges[i].t2.y);
  }

  ctx.stroke();
}
