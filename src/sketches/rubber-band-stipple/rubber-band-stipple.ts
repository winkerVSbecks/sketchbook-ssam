import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { drawCircle, drawPath } from '@daeinc/draw';
import { Delaunay } from 'd3-delaunay';
import { interpolate, formatCss } from 'culori';
import { generateColors } from '../../subtractive-color';

type Point = [number, number];

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
  count: 140 * 2,
  maxConnections: 2,
  maxConnDistFactor: 0.22,
  minR: 3, //6,
  maxR: 20, //30,
  showVoronoi: false,
};

export const sketch = ({
  wrap,
  context,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const colors = generateColors();
  const bg = colors.pop()!;
  const strokeColor = `hsl(from ${colors.pop()!} h s l / 0.5)`;
  const colorScale = interpolate(colors);
  const colorMap = (t: number) => formatCss(colorScale(t));

  const maxConnDist = width * config.maxConnDistFactor;

  const noise = (x: number, y: number, t: number): number => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];
    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  const margin = 60;
  const minDist = ((width - 2 * margin) / Math.sqrt(config.count)) * 0.75;
  const positions: Vec2[] = [];
  let attempts = 0;
  while (positions.length < config.count && attempts < config.count * 40) {
    attempts++;
    const pt = {
      x: Random.range(margin, width - margin),
      y: Random.range(margin, height - margin),
    };
    if (!positions.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)) {
      positions.push(pt);
    }
  }

  // Collect all valid pairs, shuffle, greedily assign — prevents chain topology
  const allPairs: [number, number][] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = Math.hypot(
        positions[j].x - positions[i].x,
        positions[j].y - positions[i].y,
      );
      if (d <= maxConnDist) allPairs.push([i, j]);
    }
  }

  const edges: [number, number][] = [];
  const connCount = new Array(positions.length).fill(0);
  for (const [i, j] of Random.shuffle(allPairs)) {
    if (
      connCount[i] < config.maxConnections &&
      connCount[j] < config.maxConnections
    ) {
      edges.push([i, j]);
      connCount[i]++;
      connCount[j]++;
    }
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const driftAmt = width * 0.025;

    const circles: Circle[] = positions.map((p) => {
      const t = noise(p.x, p.y, playhead);
      const r = mapRange(t, -1, 1, config.minR, config.maxR, true);
      const dx = noise(p.x + 500, p.y, playhead) * driftAmt;
      const dy = noise(p.x, p.y + 500, playhead) * driftAmt;
      return { x: p.x + dx, y: p.y + dy, r };
    });

    // Voronoi cell outlines from current circle positions
    if (config.showVoronoi) {
      const flatPts = new Float64Array(circles.length * 2);
      circles.forEach((c, i) => {
        flatPts[i * 2] = c.x;
        flatPts[i * 2 + 1] = c.y;
      });
      const delaunay = new Delaunay(flatPts);
      const voronoi = delaunay.voronoi([0, 0, width, height]);

      context.strokeStyle = strokeColor;
      context.lineWidth = 0.75;
      for (const poly of voronoi.cellPolygons()) {
        context.beginPath();
        drawPath(context, poly as unknown as Point[]);
        context.stroke();
      }
    }

    // Rubber bands
    context.strokeStyle = strokeColor;
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    for (const [i, j] of edges) {
      const ci = circles[i];
      const cj = circles[j];
      const d = Math.hypot(cj.x - ci.x, cj.y - ci.y);
      if (d > ci.r + cj.r + 2) {
        drawRubberBand(context, [ci, cj]);
      }
    }

    // Stipple circles colored by noise value
    for (const c of circles) {
      const t = noise(c.x, c.y, playhead);
      context.fillStyle = colorMap(mapRange(t, -1, 1, 0, 1, true));
      context.beginPath();
      drawCircle(context, [c.x, c.y] as Point, c.r * 2);
      context.fill();

      // Small bg-colored inner dot (from stipling-noise aesthetic)
      context.fillStyle = bg;
      context.beginPath();
      drawCircle(context, [c.x, c.y] as Point, 7);
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

function drawRubberBand(
  ctx: CanvasRenderingContext2D,
  circles: Circle[],
): void {
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
