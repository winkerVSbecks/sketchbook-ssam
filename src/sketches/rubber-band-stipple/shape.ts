import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { interpolate, formatCss } from 'culori';
import { Pane } from 'tweakpane';
import { generateColors } from '../../subtractive-color';

const MAX_LAYERS = 12;

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
  layers: 3,
  count: 16,
  minR: 20,
  maxR: 160,
  driftFactor: 0.025,
  hullSamples: 360,
  strokeWidth: 2.5,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'layers', { min: 1, max: MAX_LAYERS, step: 1 });
pane.addBinding(config, 'count', { min: 3, max: 60, step: 1 });
pane.addBinding(config, 'minR', { min: 4, max: 200, step: 1 });
pane.addBinding(config, 'maxR', { min: 20, max: 300, step: 1 });
pane.addBinding(config, 'driftFactor', { min: 0, max: 0.1, step: 0.001 });
pane.addBinding(config, 'hullSamples', { min: 32, max: 1440, step: 1 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 12, step: 0.1 });

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

  const noise = (x: number, y: number, t: number): number => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];
    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  const driftAmt = width * config.driftFactor;

  // Each layer is an independent poisson-disc set. Pre-generated up to
  // MAX_LAYERS so toggling the layer slider doesn't reshuffle the existing
  // ones; regenerated only when `count` changes.
  const layerPositions: Vec2[][] = [];
  let cachedCount = -1;
  const ensureLayers = () => {
    if (config.count === cachedCount) return;
    const margin = config.maxR + driftAmt + 4;
    const minDist = ((width - 2 * margin) / Math.sqrt(config.count)) * 0.75;
    layerPositions.length = 0;
    for (let l = 0; l < MAX_LAYERS; l++) {
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
      layerPositions.push(positions);
    }
    cachedCount = config.count;
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    ensureLayers();

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    for (let layer = 0; layer < config.layers; layer++) {
      const positions = layerPositions[layer];
      const offset = layer * 1000;

      const circles: Circle[] = positions.map((p) => {
        const t = noise(p.x + offset, p.y + offset, playhead);
        const r = mapRange(t, -1, 1, config.minR, config.maxR, true);
        const dx = noise(p.x + offset + 500, p.y + offset, playhead) * driftAmt;
        const dy = noise(p.x + offset, p.y + offset + 500, playhead) * driftAmt;
        return { x: p.x + dx, y: p.y + dy, r };
      });

      const hullCircles = hullOfCircles(circles, config.hullSamples);
      if (hullCircles.length < 2) continue;

      rubberBandPath(context, hullCircles);
      context.fillStyle = colorMap((layer + 0.5) / config.layers);
      context.fill();
      context.strokeStyle = strokeColor;
      context.lineWidth = config.strokeWidth;
      context.lineJoin = 'round';
      context.stroke();
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

// --- Vec2 math ---

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

// --- Rubber band ---

// True external tangent on the perpRight side of dir(c1→c2). For unequal radii
// the tangent line is tilted, so the outward normal is n = a·dir + b·perpRight
// with a = (r1−r2)/d and b = √(1−a²); the simple `perpRight` form (a=0) only
// works when r1 == r2 and produces drifting angles otherwise.
function getTangentPoints(c1: Circle, c2: Circle): { t1: Vec2; t2: Vec2 } {
  const diff = sub(c2, c1);
  const d = Math.hypot(diff.x, diff.y);
  const dir = { x: diff.x / d, y: diff.y / d };
  const right = perpRight(dir);
  const a = (c1.r - c2.r) / d;
  const b = Math.sqrt(Math.max(0, 1 - a * a));
  const n = { x: a * dir.x + b * right.x, y: a * dir.y + b * right.y };
  return {
    t1: add(c1, scale(n, c1.r)),
    t2: add(c2, scale(n, c2.r)),
  };
}

function rubberBandPath(
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
  ctx.closePath();
}

// Convex hull of disks via the support function: for each direction θ, the
// supporting disk is the one with the highest signed projection plus radius.
// Each disk wins over a contiguous range of θ (a disk's support function is
// concave in θ), so walking θ from 0 to 2π gives a clean CCW (math) traversal
// of the hull with each disk appearing in at most one arc.
function hullOfCircles(circles: Circle[], samples: number): Circle[] {
  if (circles.length < 2) return circles.slice();

  const ordered: number[] = [];
  let last = -1;
  for (let s = 0; s < samples; s++) {
    const theta = (s / samples) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    let best = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < circles.length; i++) {
      const v = circles[i].x * cos + circles[i].y * sin + circles[i].r;
      if (v > bestVal) {
        bestVal = v;
        best = i;
      }
    }
    if (best !== last) {
      ordered.push(best);
      last = best;
    }
  }
  if (ordered.length > 1 && ordered[0] === ordered[ordered.length - 1]) {
    ordered.pop();
  }
  return ordered.map((i) => circles[i]);
}
