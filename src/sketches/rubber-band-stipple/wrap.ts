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
  strokeWidth: 12,
  dotRadius: 7,
  relaxIterations: 24,
  bevelStrength: 14,
  bevelLayers: 6,
  hullFill: false,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'count', { min: 3, max: 60, step: 1 });
pane.addBinding(config, 'minR', { min: 4, max: 200, step: 1 });
pane.addBinding(config, 'maxR', { min: 20, max: 300, step: 1 });
pane.addBinding(config, 'driftFactor', { min: 0, max: 0.1, step: 0.001 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 12, step: 0.1 });
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
  // canvas gradient.addColorStop can't parse `hsl(from ... calc(...))`, so
  // shift lightness in culori-land and format a plain string for the stop.
  const toHsl = converter('hsl');
  const shiftLightness = (color: string, deltaPct: number): string => {
    const c = toHsl(color)!;
    return formatCss({
      ...c,
      l: Math.min(1, Math.max(0, c.l + deltaPct / 100)),
    });
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
  let wrapOrder: number[] = [];
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

    // Freeze the wrap topology by angular-sorting position indices around the
    // stable centroid once. Per-frame motion stretches the band but never
    // reorders it.
    let cx = 0;
    let cy = 0;
    for (const p of positions) {
      cx += p.x;
      cy += p.y;
    }
    cx /= positions.length;
    cy /= positions.length;
    wrapOrder = positions
      .map((_, i) => i)
      .sort(
        (a, b) =>
          Math.atan2(positions[a].y - cy, positions[a].x - cx) -
          Math.atan2(positions[b].y - cy, positions[b].x - cx),
      );

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

    // Inflate by half the stroke width so the wrap line's inner edge sits
    // tangent to each circle — the band ends up completely outside.
    const halfCS = config.strokeWidth / 2;

    // Resolve overlaps: each colliding pair separates along their centerline,
    // weighted so the larger circle barely moves and the smaller is displaced.
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

    // Inflated copies (outer-halo extent) drive the band geometry.
    const haloCircles: Circle[] = circles.map((c) => ({
      x: c.x,
      y: c.y,
      r: c.r + halfCS,
    }));

    // One closed rubber-band that visits every halo circle exactly once,
    // following the topology frozen in `wrapOrder` so the band stretches with
    // motion instead of snapping to a new order.
    if (haloCircles.length < 2) return;
    const ordered = wrapOrder.map((i) => haloCircles[i]);
    rubberBandPath(context, ordered);
    if (config.hullFill) {
      context.fillStyle = colorMap(0.5);
      context.fill();
    }
    context.lineJoin = 'round';

    // Nested strokes give the band a beveled tube look: each layer is a bit
    // narrower than the last, and lightness ramps from dark on the outer edge
    // to light at the inner core for a convex highlight.
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

    // Stipple aesthetic: each circle gets a two-stop bevel gradient (light
    // top-left → dark bottom-right) suggesting a soft 3D rim under a single
    // overhead-left light source, then a thin halo stroke and a center dot.
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

      context.fillStyle = bg;
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius, 0, Math.PI * 2);
      context.fill();

      // Top shadow rim sits inside the dot; bottom highlight kicks just
      // outside the dot like a bright spill from the lit lower edge.
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
