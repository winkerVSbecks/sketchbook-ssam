import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { interpolate, formatCss, converter } from 'culori';
import { Pane } from 'tweakpane';
import { generateColors } from '../../subtractive-color';

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
  count: 16,
  seed: 42,
  minR: 20,
  maxR: 160,
  strokeWidth: 12,
  dotRadius: 7,
  relaxIterations: 12,
  bevelStrength: 14,
  bevelLayers: 6,
  hullFill: false,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'count', { min: 3, max: 60, step: 1 });
pane.addBinding(config, 'seed', { min: 0, max: 999, step: 1 });
pane.addBinding(config, 'minR', { min: 4, max: 200, step: 1 });
pane.addBinding(config, 'maxR', { min: 20, max: 300, step: 1 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 30, step: 0.5 });
pane.addBinding(config, 'dotRadius', { min: 0, max: 30, step: 0.5 });
pane.addBinding(config, 'relaxIterations', { min: 0, max: 24, step: 1 });
pane.addBinding(config, 'bevelStrength', { min: 0, max: 40, step: 1 });
pane.addBinding(config, 'bevelLayers', { min: 1, max: 16, step: 1 });
pane.addBinding(config, 'hullFill');

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
  const bg = '#000000';
  const colorScale = interpolate(colors);
  const colorMap = (t: number) => formatCss(colorScale(t));
  const toHsl = converter('hsl');
  const shiftLightness = (color: string, deltaPct: number): string => {
    const c = toHsl(color)!;
    return formatCss({
      ...c,
      l: Math.min(1, Math.max(0, c.l + deltaPct / 100)),
    });
  };

  // Reseed every render so the layout is deterministic for a given config.
  // animate:true keeps tweakpane edits live; the output is visually static.
  wrap.render = ({ width, height }: SketchProps) => {
    Random.setSeed(config.seed);

    const halfCS = config.strokeWidth / 2;
    const margin = config.maxR + halfCS + 8;
    const minDist = ((width - 2 * margin) / Math.sqrt(config.count)) * 0.75;

    const circles: Circle[] = [];
    let attempts = 0;
    while (circles.length < config.count && attempts < config.count * 40) {
      attempts++;
      const pt = {
        x: Random.range(margin, width - margin),
        y: Random.range(margin, height - margin),
      };
      if (!circles.some((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < minDist)) {
        circles.push({ x: pt.x, y: pt.y, r: Random.range(config.minR, config.maxR) });
      }
    }

    // Assign colors before the relax loop so they stay tied to circle identity
    const circleColors = circles.map(() => colorMap(Random.value()));

    // Inflate by half stroke so the band's inner edge is tangent to each circle
    const halos: Circle[] = circles.map((c) => ({ x: c.x, y: c.y, r: c.r + halfCS }));

    // Separate overlapping halos; sync positions back to circles
    for (let iter = 0; iter < config.relaxIterations; iter++) {
      for (let i = 0; i < halos.length; i++) {
        for (let j = i + 1; j < halos.length; j++) {
          const a = halos[i];
          const b = halos[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = a.r + b.r;
          if (d >= minD || d < 1e-6) continue;
          const push = (minD - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
      for (let i = 0; i < halos.length; i++) {
        const c = halos[i];
        c.x = Math.min(Math.max(c.x, c.r), width - c.r);
        c.y = Math.min(Math.max(c.y, c.r), height - c.r);
        circles[i].x = c.x;
        circles[i].y = c.y;
      }
    }

    // Hull of centers + obstacle pass: any circle whose boundary pokes through
    // a tangent segment is inserted into the band so the path never crosses it.
    const bandCircles = buildBandCircles(halos);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (bandCircles.length >= 2) {
      rubberBandPath(context, bandCircles);

      if (config.hullFill) {
        context.fillStyle = colorMap(0.5);
        context.fill();
      }

      context.lineJoin = 'round';

      const bandBase = colorMap(0.5);
      const n = config.bevelLayers;
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : k / (n - 1);
        context.lineWidth = mapRange(
          t,
          0,
          1,
          config.strokeWidth,
          Math.max(0.5, config.strokeWidth * 0.1),
        );
        context.strokeStyle = shiftLightness(
          bandBase,
          mapRange(t, 0, 1, -config.bevelStrength, config.bevelStrength),
        );
        context.stroke();
      }
    }

    for (let ci = 0; ci < circles.length; ci++) {
      const c = circles[ci];
      const baseColor = circleColors[ci];
      const grad = context.createLinearGradient(
        c.x - c.r,
        c.y - c.r,
        c.x + c.r,
        c.y + c.r,
      );
      grad.addColorStop(0, shiftLightness(baseColor, config.bevelStrength));
      grad.addColorStop(1, shiftLightness(baseColor, -config.bevelStrength));
      context.fillStyle = grad;
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = bg;
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = shiftLightness(bg, -config.bevelStrength);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(
        c.x,
        c.y,
        config.dotRadius - 1,
        (13 * Math.PI) / 12,
        (23 * Math.PI) / 12,
      );
      context.stroke();

      context.strokeStyle = shiftLightness(bg, config.bevelStrength * 5);
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(
        c.x,
        c.y,
        config.dotRadius + 0.75,
        Math.PI / 4,
        (3 * Math.PI) / 4,
      );
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
  playFps: 30,
  exportFps: 30,
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
function perpRight(v: Vec2): Vec2 {
  return { x: v.y, y: -v.x };
}
function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

// --- Convex hull (Andrew's monotone chain, CCW in Y-up = CW on canvas screen) ---

function convexHull(circles: Circle[]): number[] {
  const n = circles.length;
  if (n < 3) return circles.map((_, i) => i);

  const idx = circles
    .map((_, i) => i)
    .sort((a, b) =>
      circles[a].x !== circles[b].x
        ? circles[a].x - circles[b].x
        : circles[a].y - circles[b].y,
    );

  const cross = (o: number, a: number, b: number): number => {
    const oc = circles[o];
    const ac = circles[a];
    const bc = circles[b];
    return (ac.x - oc.x) * (bc.y - oc.y) - (ac.y - oc.y) * (bc.x - oc.x);
  };

  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0)
      lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0)
      upper.pop();
    upper.push(i);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// --- External tangent on the perpRight side (correct for unequal radii) ---

function tangentPoints(c1: Circle, c2: Circle): { t1: Vec2; t2: Vec2 } {
  const diff = sub(c2, c1);
  const d = Math.hypot(diff.x, diff.y);
  if (d < 1e-6) return { t1: { x: c1.x, y: c1.y }, t2: { x: c2.x, y: c2.y } };
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

// --- Segment / disk intersection (parametric t ∈ [0,1] along segment a→b) ---

function intersectSegmentDisk(a: Vec2, b: Vec2, c: Circle): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - c.x;
  const fy = a.y - c.y;
  const dd = dx * dx + dy * dy;
  if (dd < 1e-12) return false;
  const fd = fx * dx + fy * dy;
  const ff = fx * fx + fy * fy - c.r * c.r;
  const disc = fd * fd - dd * ff;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  const t0 = (-fd - sq) / dd;
  const t1 = (-fd + sq) / dd;
  return t1 >= 0 && t0 <= 1;
}

// --- Build the band: hull of centers + insert any circle whose boundary pokes
//     through a tangent segment. Iterates until no more insertions are needed. ---

function buildBandCircles(halos: Circle[]): Circle[] {
  if (halos.length < 3) return [...halos];

  const hullIdx = convexHull(halos);
  const band: Circle[] = hullIdx.map((i) => halos[i]);
  const inBand = new Set<Circle>(band);

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < band.length; i++) {
      const a = band[i];
      const b = band[(i + 1) % band.length];
      const { t1, t2 } = tangentPoints(a, b);

      const hits: { t: number; circle: Circle }[] = [];
      for (const c of halos) {
        if (inBand.has(c)) continue;
        if (!intersectSegmentDisk(t1, t2, c)) continue;
        const sx = t2.x - t1.x;
        const sy = t2.y - t1.y;
        const dd = sx * sx + sy * sy;
        const proj = dd > 1e-12 ? ((c.x - t1.x) * sx + (c.y - t1.y) * sy) / dd : 0;
        hits.push({ t: Math.max(0, Math.min(1, proj)), circle: c });
      }

      if (hits.length > 0) {
        hits.sort((x, y) => x.t - y.t);
        band.splice(i + 1, 0, ...hits.map((h) => h.circle));
        for (const h of hits) inBand.add(h.circle);
        changed = true;
        break; // restart scan with updated band
      }
    }
  }

  return band;
}

// --- Rubber band: closed path tangent to each circle in band order ---

function rubberBandPath(ctx: CanvasRenderingContext2D, circles: Circle[]): void {
  const n = circles.length;
  const edges = circles.map((c, i) => tangentPoints(c, circles[(i + 1) % n]));

  ctx.beginPath();
  ctx.moveTo(edges[n - 1].t2.x, edges[n - 1].t2.y);

  for (let i = 0; i < n; i++) {
    const c = circles[i];
    const arrival = edges[(i - 1 + n) % n].t2;
    const departure = edges[i].t1;

    const aAngle = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const dAngle = Math.atan2(departure.y - c.y, departure.x - c.x);

    // false = clockwise on canvas (Y-down); traversal is CW on screen, outer arc is short
    ctx.arc(c.x, c.y, c.r, aAngle, dAngle, false);
    ctx.lineTo(edges[i].t2.x, edges[i].t2.y);
  }

  ctx.closePath();
}
