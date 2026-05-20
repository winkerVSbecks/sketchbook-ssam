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
  minR: 20,
  maxR: 160,
  driftFactor: 0.025,
  hullSamples: 360,
  relaxIterations: 24,
  holeStrokeWidth: 1.5,
  gradientSpeedMult: 1,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'count', { min: 3, max: 60, step: 1 });
pane.addBinding(config, 'minR', { min: 4, max: 200, step: 1 });
pane.addBinding(config, 'maxR', { min: 20, max: 300, step: 1 });
pane.addBinding(config, 'driftFactor', { min: 0, max: 0.1, step: 0.001 });
pane.addBinding(config, 'hullSamples', { min: 32, max: 1440, step: 1 });
pane.addBinding(config, 'relaxIterations', { min: 0, max: 48, step: 1 });
pane.addBinding(config, 'holeStrokeWidth', { min: 0, max: 6, step: 0.5 });
pane.addBinding(config, 'gradientSpeedMult', { min: 0.25, max: 4, step: 0.25 });

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
  // Keep 3 colors for a three-stop field gradient.
  const fieldColors = colors.slice(-3);
  const colorScale = interpolate(fieldColors);
  const colorStop = (t: number) => formatCss(colorScale(t));

  // Disc radial gradient orders palette by lightness: lightest center, darkest rim.
  const toHsl = converter('hsl');
  const byLightness = [...fieldColors].sort(
    (a, b) => (toHsl(b)?.l ?? 0) - (toHsl(a)?.l ?? 0),
  );
  const [discLight, discMid, discDark] = byLightness;

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
  let cacheKey = '';
  const ensurePositions = () => {
    const key = `${config.count}|${config.maxR}`;
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
      if (
        !positions.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)
      ) {
        positions.push(pt);
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

    const halfCS = 0;

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
        const r = c.r;
        c.x = Math.min(Math.max(c.x, r), width - r);
        c.y = Math.min(Math.max(c.y, r), height - r);
      }
    }

    const hullCirclesFull = hullIndices(circles, config.hullSamples).map(
      (i) => circles[i],
    );
    if (hullCirclesFull.length < 2) return;

    // Gradient angle rotates a full revolution per 8s loop.
    // Multiply by gradientSpeedMult so fractional speeds (0.5×) complete a
    // half-turn, giving symmetrical color-field oscillation rather than drift.
    const angle = playhead * Math.PI * 2 * config.gradientSpeedMult;
    const cx = width / 2;
    const cy = height / 2;
    const reach = Math.hypot(width, height) / 2;
    const grad = context.createLinearGradient(
      cx - Math.cos(angle) * reach,
      cy - Math.sin(angle) * reach,
      cx + Math.cos(angle) * reach,
      cy + Math.sin(angle) * reach,
    );
    grad.addColorStop(0, colorStop(0));
    grad.addColorStop(0.5, colorStop(0.5));
    grad.addColorStop(1, colorStop(1));

    // Fill the hull with the rotating color field.
    rubberBandPath(context, hullCirclesFull);
    context.fillStyle = grad;
    context.fill();

    // Discs carry the field's 3-stop palette as a radial gradient — symmetric
    // in all directions so they read as standalone forms against the rotating field.
    for (const c of circles) {
      const discGrad = context.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      discGrad.addColorStop(0, discLight);
      discGrad.addColorStop(0.5, discMid);
      discGrad.addColorStop(1, discDark);

      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fillStyle = discGrad;
      context.fill();

      if (config.holeStrokeWidth > 0) {
        context.strokeStyle = colorStop(0.5);
        context.lineWidth = config.holeStrokeWidth;
        context.stroke();
      }
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
