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
  gridN: 5,
  perturbation: 0.45,
  minR: 20,
  maxR: 120,
  driftFactor: 0.025,
  hullSamples: 360,
  strokeWidth: 2,
  dotRadius: 7,
  relaxIterations: 24,
  circleStrokeWidth: 2,
  bevelStrength: 14,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'gridN', { min: 3, max: 10, step: 1, label: 'grid N' });
pane.addBinding(config, 'perturbation', { min: 0, max: 1, step: 0.01 });
pane.addBinding(config, 'minR', { min: 4, max: 200, step: 1 });
pane.addBinding(config, 'maxR', { min: 20, max: 300, step: 1 });
pane.addBinding(config, 'driftFactor', { min: 0, max: 0.1, step: 0.001 });
pane.addBinding(config, 'hullSamples', { min: 32, max: 1440, step: 1 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 12, step: 0.1 });
pane.addBinding(config, 'dotRadius', { min: 0, max: 30, step: 0.5 });
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

  // Grid positions are stable per (gridN, perturbation, maxR). Each cell's
  // perturbation offset is seeded by cell index so the layout is fully
  // deterministic across frames and hot reloads.
  let positions: Vec2[] = [];
  let edges: [number, number][] = [];
  let cacheKey = '';

  const ensurePositions = () => {
    const key = `${config.gridN}|${config.perturbation}|${config.maxR}|${config.hullSamples}`;
    if (key === cacheKey) return;

    const N = config.gridN;
    const margin = config.maxR + driftAmt + 4;
    const usableW = width - 2 * margin;
    const usableH = height - 2 * margin;
    const cellW = usableW / N;
    const cellH = usableH / N;

    positions = [];
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        // Seed per cell so offsets are deterministic regardless of frame.
        const cellSeed = row * N + col;
        const rng = Random.createRandom(cellSeed);
        // Perturbation 0 → cell center; 1 → anywhere within cell.
        const ox = (rng.value() - 0.5) * config.perturbation * cellW;
        const oy = (rng.value() - 0.5) * config.perturbation * cellH;
        positions.push({
          x: margin + (col + 0.5) * cellW + ox,
          y: margin + (row + 0.5) * cellH + oy,
        });
      }
    }

    // 4-connectivity rook edges (right + down only to avoid duplicates).
    edges = [];
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const idx = row * N + col;
        if (col + 1 < N) edges.push([idx, idx + 1]);
        if (row + 1 < N) edges.push([idx, idx + N]);
      }
    }

    cacheKey = key;
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    ensurePositions();

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

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

    const hullCircles = hullIndices(haloCircles, config.hullSamples).map(
      (i) => haloCircles[i],
    );
    if (hullCircles.length < 2) return;

    rubberBandPath(context, hullCircles);
    context.fillStyle = colorMap(0.5);
    context.fill();
    context.strokeStyle = strokeColor;
    context.lineWidth = config.strokeWidth;
    context.lineJoin = 'round';
    context.stroke();

    // Tendons along grid adjacency edges.
    context.strokeStyle = strokeColor;
    for (const [i, j] of edges) {
      const ci = haloCircles[i];
      const cj = haloCircles[j];
      const d = Math.hypot(cj.x - ci.x, cj.y - ci.y);
      if (d > ci.r + cj.r + 2) {
        rubberBandPath(context, [ci, cj]);
        context.stroke();
      }
    }

    for (const c of circles) {
      const t = noise(c.x, c.y, playhead);
      const baseColor = colorMap(mapRange(t, -1, 1, 0, 1, true));
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
