import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';

interface Vec2 {
  x: number;
  y: number;
}
interface Circle {
  x: number;
  y: number;
  r: number;
}

const COUNT = 70;
const MAX_CONNECTIONS = 2;
const MAX_CONN_DIST_FACTOR = 0.22;

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const maxConnDist = width * MAX_CONN_DIST_FACTOR;

  // 4D noise helper — same pattern as stipling-noise.ts
  const noise = (x: number, y: number, t: number): number => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];
    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  // Poisson-disc-like rejection sampling for well-spread positions
  const margin = 60;
  const minDist = ((width - 2 * margin) / Math.sqrt(COUNT)) * 0.75;
  const positions: Vec2[] = [];
  let attempts = 0;
  while (positions.length < COUNT && attempts < COUNT * 40) {
    attempts++;
    const pt = {
      x: Random.range(margin, width - margin),
      y: Random.range(margin, height - margin),
    };
    if (!positions.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)) {
      positions.push(pt);
    }
  }

  // Sparse k-NN edge graph: each node connects to at most MAX_CONNECTIONS neighbours
  const edges: [number, number][] = [];
  const edgeSet = new Set<string>();
  const connCount = new Array(positions.length).fill(0);

  for (let i = 0; i < positions.length; i++) {
    if (connCount[i] >= MAX_CONNECTIONS) continue;

    const candidates = positions
      .map((p, j) => ({
        j,
        d: Math.hypot(p.x - positions[i].x, p.y - positions[i].y),
      }))
      .filter(({ j, d }) => j !== i && d <= maxConnDist)
      .sort((a, b) => a.d - b.d);

    for (const { j } of candidates) {
      if (connCount[i] >= MAX_CONNECTIONS) break;
      if (connCount[j] >= MAX_CONNECTIONS) continue;
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([i, j]);
        connCount[i]++;
        connCount[j]++;
      }
    }
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = '#0a0a0a';
    context.fillRect(0, 0, width, height);

    const minR = 6;
    const maxR = 30;
    const driftAmt = width * 0.025;

    // Noise-driven radius and gentle position drift — same noise fn as stipling-noise.ts
    const circles: Circle[] = positions.map((p) => {
      const t = noise(p.x, p.y, playhead);
      const r = mapRange(t, -1, 1, minR, maxR, true);
      const dx = noise(p.x + 500, p.y, playhead) * driftAmt;
      const dy = noise(p.x, p.y + 500, playhead) * driftAmt;
      return { x: p.x + dx, y: p.y + dy, r };
    });

    // Rubber bands drawn behind circles
    context.strokeStyle = 'rgba(255,255,255,0.55)';
    context.lineWidth = 2;
    context.lineJoin = 'round';

    for (const [i, j] of edges) {
      const ci = circles[i];
      const cj = circles[j];
      const d = Math.hypot(cj.x - ci.x, cj.y - ci.y);
      // Guard against overlapping circles where tangent geometry breaks down
      if (d > ci.r + cj.r + 2) {
        drawRubberBand(context, [ci, cj]);
      }
    }

    // Stipple circles on top
    for (const c of circles) {
      const t = noise(c.x, c.y, playhead);
      const alpha = mapRange(t, -1, 1, 0.5, 0.95, true);
      context.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
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
  duration: 8000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);

// --- Vec2 math (from rubber-banding/basic.ts) ---

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}
function normalize(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
}
function perpRight(v: Vec2): Vec2 {
  return { x: v.y, y: -v.x };
}

// --- Rubber band (from rubber-banding/basic.ts) ---

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
  const edges = circles.map((c, i) =>
    getTangentPoints(c, circles[(i + 1) % n]),
  );

  ctx.beginPath();
  const firstArrival = edges[n - 1].t2;
  ctx.moveTo(firstArrival.x, firstArrival.y);

  for (let i = 0; i < n; i++) {
    const c = circles[i];
    const arrival = edges[(i - 1 + n) % n].t2;
    const departure = edges[i].t1;

    const aAngle = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const dAngle = Math.atan2(departure.y - c.y, departure.x - c.x);

    ctx.arc(c.x, c.y, c.r, aAngle, dAngle, false);
    ctx.lineTo(edges[i].t2.x, edges[i].t2.y);
  }

  ctx.stroke();
}
