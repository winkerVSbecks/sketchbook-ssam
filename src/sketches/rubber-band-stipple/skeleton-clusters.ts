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
  clusterCount: 3,
  minR: 20,
  maxR: 160,
  driftFactor: 0.025,
  hullSamples: 360,
  strokeWidth: 1,
  membraneStrokeWidth: 2,
  dotRadius: 7,
  connectionsPerInside: 2,
  relaxIterations: 24,
  circleStrokeWidth: 2,
  bevelStrength: 14,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'count', { min: 3, max: 60, step: 1 });
pane.addBinding(config, 'clusterCount', { min: 2, max: 4, step: 1, label: 'clusters' });
pane.addBinding(config, 'minR', { min: 4, max: 200, step: 1 });
pane.addBinding(config, 'maxR', { min: 20, max: 300, step: 1 });
pane.addBinding(config, 'driftFactor', { min: 0, max: 0.1, step: 0.001 });
pane.addBinding(config, 'hullSamples', { min: 32, max: 1440, step: 1 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 12, step: 0.1 });
pane.addBinding(config, 'membraneStrokeWidth', { min: 0, max: 12, step: 0.1 });
pane.addBinding(config, 'dotRadius', { min: 0, max: 30, step: 0.5 });
pane.addBinding(config, 'connectionsPerInside', { min: 1, max: 6, step: 1 });
pane.addBinding(config, 'relaxIterations', { min: 0, max: 24, step: 1 });
pane.addBinding(config, 'circleStrokeWidth', { min: 0, max: 30, step: 0.5 });
pane.addBinding(config, 'bevelStrength', { min: 0, max: 40, step: 1 });

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
  const toHsl = converter('hsl');
  const shiftLightness = (color: string, deltaPct: number): string => {
    const c = toHsl(color)!;
    return formatCss({ ...c, l: Math.min(1, Math.max(0, c.l + deltaPct / 100)) });
  };

  const noise = (x: number, y: number, t: number): number => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];
    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  const driftAmt = width * config.driftFactor;

  let positions: Vec2[] = [];
  // clusterAssignment[i] = cluster index for positions[i]
  let clusterAssignment: number[] = [];
  // per-cluster: global position indices on that cluster's stable hull boundary
  let clusterBoundaryIndices: number[][] = [];
  // per-cluster: tendon edges as [insideGlobalIdx, boundaryGlobalIdx]
  let clusterEdges: [number, number][][] = [];
  let cacheKey = '';

  const ensurePositions = () => {
    const key = `${config.count}|${config.clusterCount}|${config.maxR}|${config.hullSamples}|${config.connectionsPerInside}`;
    if (key === cacheKey) return;

    const margin = config.maxR + driftAmt + 4;
    const minDist = ((width - 2 * margin) / Math.sqrt(config.count)) * 0.75;
    positions = [];
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

    const n = positions.length;
    const K = Math.min(config.clusterCount, n);

    // Seed centroids at evenly-spaced indices — deterministic given same positions[]
    const centroids: Vec2[] = Array.from({ length: K }, (_, k) => {
      const idx = Math.floor((k * n) / K);
      return { x: positions[idx].x, y: positions[idx].y };
    });

    clusterAssignment = new Array(n).fill(0);
    for (let iter = 0; iter < 20; iter++) {
      for (let i = 0; i < n; i++) {
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < K; k++) {
          const d = Math.hypot(positions[i].x - centroids[k].x, positions[i].y - centroids[k].y);
          if (d < bestD) { bestD = d; best = k; }
        }
        clusterAssignment[i] = best;
      }
      for (let k = 0; k < K; k++) {
        const members = positions.filter((_, i) => clusterAssignment[i] === k);
        if (members.length === 0) continue;
        centroids[k] = {
          x: members.reduce((s, p) => s + p.x, 0) / members.length,
          y: members.reduce((s, p) => s + p.y, 0) / members.length,
        };
      }
    }

    const stableDisks: Circle[] = positions.map((p) => ({ x: p.x, y: p.y, r: config.maxR }));

    clusterBoundaryIndices = [];
    clusterEdges = [];

    for (let k = 0; k < K; k++) {
      const memberIndices = positions.map((_, i) => i).filter((i) => clusterAssignment[i] === k);
      if (memberIndices.length < 2) {
        clusterBoundaryIndices.push(memberIndices);
        clusterEdges.push([]);
        continue;
      }
      const memberDisks = memberIndices.map((i) => stableDisks[i]);
      const localHull = hullIndices(memberDisks, config.hullSamples);
      const boundaryGlobal = localHull.map((li) => memberIndices[li]);
      clusterBoundaryIndices.push(boundaryGlobal);

      const onBoundary = new Set(boundaryGlobal);
      const insideGlobal = memberIndices.filter((i) => !onBoundary.has(i));
      const edges: [number, number][] = [];
      for (const j of insideGlobal) {
        const sorted = [...boundaryGlobal].sort((a, b) => {
          const da = Math.hypot(positions[a].x - positions[j].x, positions[a].y - positions[j].y);
          const db = Math.hypot(positions[b].x - positions[j].x, positions[b].y - positions[j].y);
          return da - db;
        });
        const kk = Math.min(config.connectionsPerInside, sorted.length);
        for (let m = 0; m < kk; m++) edges.push([j, sorted[m]]);
      }
      clusterEdges.push(edges);
    }

    cacheKey = key;
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    ensurePositions();

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const K = Math.min(config.clusterCount, positions.length);

    const circles: Circle[] = positions.map((p) => {
      const t = noise(p.x, p.y, playhead);
      const r = mapRange(t, -1, 1, config.minR, config.maxR, true);
      const dx = noise(p.x + 500, p.y, playhead) * driftAmt;
      const dy = noise(p.x, p.y + 500, playhead) * driftAmt;
      return { x: p.x + dx, y: p.y + dy, r };
    });

    const halfCS = config.circleStrokeWidth / 2;

    for (let iter = 0; iter < config.relaxIterations; iter++) {
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i];
          const b = circles[j];
          const ra = a.r + halfCS;
          const rb = b.r + halfCS;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const minD = ra + rb;
          if (d >= minD || d < 1e-6) continue;
          const overlap = minD - d;
          const nx = dx / d;
          const ny = dy / d;
          const totalR = ra + rb;
          const aShare = rb / totalR;
          const bShare = ra / totalR;
          a.x -= nx * overlap * aShare;
          a.y -= ny * overlap * aShare;
          b.x += nx * overlap * bShare;
          b.y += ny * overlap * bShare;
        }
      }
      for (const c of circles) {
        const r = c.r + halfCS;
        c.x = Math.min(Math.max(c.x, r), width - r);
        c.y = Math.min(Math.max(c.y, r), height - r);
      }
    }

    const haloCircles: Circle[] = circles.map((c) => ({
      x: c.x,
      y: c.y,
      r: c.r + halfCS,
    }));

    // Super-hull: outermost membrane wrapping every circle
    const superHullCircles = hullIndices(haloCircles, config.hullSamples).map((i) => haloCircles[i]);
    if (superHullCircles.length >= 2) {
      rubberBandPath(context, superHullCircles);
      context.fillStyle = colorMap(0);
      context.fill();
      context.strokeStyle = strokeColor;
      context.lineWidth = config.strokeWidth;
      context.lineJoin = 'round';
      context.stroke();
    }

    // Cluster membranes: each cluster's hull, filled + stroked, nested inside super-hull
    for (let k = 0; k < K; k++) {
      const memberHalos = haloCircles.filter((_, i) => clusterAssignment[i] === k);
      if (memberHalos.length < 2) continue;
      const localHull = hullIndices(memberHalos, config.hullSamples);
      if (localHull.length < 2) continue;
      const clusterHullCircles = localHull.map((li) => memberHalos[li]);

      // Evenly-spaced color slices avoid endpoints: cluster 0 → 1/(K+1), etc.
      const fillColor = colorMap((k + 1) / (K + 1));

      rubberBandPath(context, clusterHullCircles);
      context.fillStyle = fillColor;
      context.fill();
      context.strokeStyle = strokeColor;
      context.lineWidth = config.membraneStrokeWidth;
      context.lineJoin = 'round';
      context.stroke();
    }

    // Intra-cluster tendons: connect inside circles to their cluster boundary
    context.strokeStyle = strokeColor;
    context.lineWidth = config.membraneStrokeWidth * 0.5;
    for (let k = 0; k < K; k++) {
      for (const [i, j] of clusterEdges[k] ?? []) {
        const ci = haloCircles[i];
        const cj = haloCircles[j];
        const d = Math.hypot(cj.x - ci.x, cj.y - ci.y);
        if (d > ci.r + cj.r + 2) {
          rubberBandPath(context, [ci, cj]);
          context.stroke();
        }
      }
    }

    // Stipple discs: bevel gradient + halo stroke + center dot + rim arcs
    for (const c of circles) {
      const t = noise(c.x, c.y, playhead);
      const baseColor = colorMap(mapRange(t, -1, 1, 0, 1, true));
      const grad = context.createLinearGradient(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r);
      grad.addColorStop(0, shiftLightness(baseColor, config.bevelStrength));
      grad.addColorStop(1, shiftLightness(baseColor, -config.bevelStrength));
      context.fillStyle = grad;
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = strokeColor;
      context.lineWidth = config.circleStrokeWidth;
      context.stroke();

      context.fillStyle = bg;
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = shiftLightness(bg, -config.bevelStrength);
      context.lineWidth = 2;
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius - 1, (13 * Math.PI) / 12, (23 * Math.PI) / 12);
      context.stroke();

      context.strokeStyle = shiftLightness(bg, config.bevelStrength * 5);
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius + 0.75, Math.PI / 4, (3 * Math.PI) / 4);
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

function rubberBandPath(ctx: CanvasRenderingContext2D, circles: Circle[]): void {
  const n = circles.length;
  const edges = circles.map((c, i) => getTangentPoints(c, circles[(i + 1) % n]));

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

function hullIndices(circles: Circle[], samples: number): number[] {
  if (circles.length < 2) return circles.map((_, i) => i);

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
  return ordered;
}
