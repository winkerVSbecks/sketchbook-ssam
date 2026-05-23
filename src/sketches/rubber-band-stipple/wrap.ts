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
interface ContactPeg {
  circle: Circle;
  role: 'convex' | 'concave';
}

const config = {
  count: 16,
  dentCount: 4,
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
pane.addBinding(config, 'dentCount', { min: 0, max: 60, step: 1 });
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

  // Per-peg state. Identity is the position index (assigned once and never
  // shuffled), so each peg keeps the same role for the lifetime of the run —
  // no wrap/unwrap popping as radii fluctuate.
  let positions: Vec2[] = [];
  let stableHullSet: Set<number> = new Set();
  let dentedSet: Set<number> = new Set();
  let stableFloaterIndices: number[] = [];
  let cacheKey = '';

  const ensurePositions = () => {
    const halfCS = config.strokeWidth / 2;
    const key = `${config.count}|${config.minR}|${config.maxR}|${config.dentCount}|${config.strokeWidth}`;
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

    // Strict stable hull: pegs on the hull when every disk is at maxR. These
    // are *definitely* hull pegs, so wrapping them as convex never produces
    // a spike. Borderline pegs (only hull when neighbours shrink) are
    // handled per-frame via escapee detection in the render loop.
    const minRT = config.minR + halfCS;
    const maxRT = config.maxR + halfCS;
    const allIndices = positions.map((_, i) => i);
    const strictTest: Circle[] = positions.map((p) => ({
      x: p.x,
      y: p.y,
      r: maxRT,
    }));
    stableHullSet = new Set(convexHullOfDisks(strictTest));

    // Generous never-on-hull set: pegs that can't reach the hull even in
    // their most-favourable radius config (peg at maxR, others at minR).
    // These are safe to designate as concave dents — they can't escape into
    // the current hull and trigger a role flip.
    const neverOnHull: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      const test: Circle[] = positions.map((p, j) => ({
        x: p.x,
        y: p.y,
        r: j === i ? maxRT : minRT,
      }));
      const hull = new Set(convexHullOfDisks(test));
      if (!hull.has(i)) neverOnHull.push(i);
    }

    const shuffled = [...neverOnHull];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Random.value() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const dentCount = Math.min(config.dentCount, neverOnHull.length);
    dentedSet = new Set(shuffled.slice(0, dentCount));

    stableFloaterIndices = allIndices.filter(
      (i) => !stableHullSet.has(i) && !dentedSet.has(i),
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

    const haloCircles: Circle[] = circles.map((c) => ({
      x: c.x,
      y: c.y,
      r: c.r + halfCS,
    }));

    if (haloCircles.length < 2) return;

    // Stable hull pegs are always convex; designated dents are always
    // concave. Borderline pegs that are currently on the actual disk hull
    // but not in the stable set are inserted as escapees (extra convex
    // pegs) so the band can't leave them outside the wrap.
    const currentHull = new Set(convexHullOfDisks(haloCircles));
    const convexSet = new Set<number>(stableHullSet);
    const dynamicFloaters: number[] = [];
    for (const i of stableFloaterIndices) {
      if (currentHull.has(i)) convexSet.add(i);
      else dynamicFloaters.push(i);
    }

    // Contact order = angular sort around the convex centroid (kernel of a
    // star-shaped polygon). Using current post-drift positions keeps the
    // polygon star-shaped and tangent segments from criss-crossing.
    let cx = 0;
    let cy = 0;
    for (const i of convexSet) {
      cx += haloCircles[i].x;
      cy += haloCircles[i].y;
    }
    const hullSize = Math.max(convexSet.size, 1);
    cx /= hullSize;
    cy /= hullSize;

    const contactIndices: number[] = [];
    for (let i = 0; i < haloCircles.length; i++) {
      if (convexSet.has(i) || dentedSet.has(i)) contactIndices.push(i);
    }
    const contactOrder = contactIndices.sort(
      (a, b) =>
        Math.atan2(haloCircles[a].y - cy, haloCircles[a].x - cx) -
        Math.atan2(haloCircles[b].y - cy, haloCircles[b].x - cx),
    );

    if (contactOrder.length < 2) return;

    const contacts: ContactPeg[] = contactOrder.map((i) => ({
      circle: haloCircles[i],
      role: convexSet.has(i) ? 'convex' : 'concave',
    }));
    const floaters = dynamicFloaters.map((i) => haloCircles[i]);

    rubberBandPath(context, contacts, floaters, halfCS);

    if (config.hullFill) {
      context.fillStyle = colorMap(0.5);
      context.fill();
    }
    context.lineJoin = 'round';

    // Nested strokes give the band a beveled tube look.
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

    // Stipple pass: gradient + center dot + rims on every circle.
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
function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
function perpRight(v: Vec2): Vec2 {
  return { x: v.y, y: -v.x };
}
function vlen(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

// --- Convex hull of disks (radius-aware, via support function) ---
// A disk is on the geometric hull of the disk set iff it is the argmax of
// the support function h(θ) = c.x·cosθ + c.y·sinθ + c.r for some direction
// θ. Sweep N directions and collect every disk that is ever the maximiser —
// this picks up disks whose radii push them past their neighbours even when
// their centers are interior to other centers.

function convexHullOfDisks(circles: Circle[]): number[] {
  const n = circles.length;
  if (n < 2) return circles.map((_, i) => i);

  const N = 360;
  const seen = new Set<number>();
  const result: number[] = [];
  let prev = -1;

  for (let k = 0; k < N; k++) {
    const theta = (k / N) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    let best = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < n; i++) {
      const c = circles[i];
      const v = c.x * cosT + c.y * sinT + c.r;
      if (v > bestVal) {
        bestVal = v;
        best = i;
      }
    }
    if (best !== prev && !seen.has(best)) {
      seen.add(best);
      result.push(best);
    }
    prev = best;
  }
  return result;
}

// --- Role-aware tangent ---
// Computes the tangent segment between two circles given their contact roles.
// side 'outside' = band wraps around the circle exterior (convex peg).
// side 'inside'  = band dips into the circle interior (concave peg).
//
// Derivation: let s = +1 for outside, -1 for inside.
// The tangent normal n satisfies dot(c2-c1, n) = s1*r1 - s2*r2,
// giving a = (s1*r1 - s2*r2) / d, b = sqrt(1 - a²).
// Tangent points: t1 = c1 + s1*r1*n,  t2 = c2 + s2*r2*n.

function getRoleAwareTangent(
  c1: Circle,
  c2: Circle,
  side1: 'outside' | 'inside',
  side2: 'outside' | 'inside',
): { t1: Vec2; t2: Vec2 } {
  const s1 = side1 === 'outside' ? 1 : -1;
  const s2 = side2 === 'outside' ? 1 : -1;
  const diff = sub(c2, c1);
  const d = vlen(diff);
  if (d < 1e-6) return { t1: { x: c1.x, y: c1.y }, t2: { x: c2.x, y: c2.y } };
  const dir = scale(diff, 1 / d);
  const right = perpRight(dir);
  const a = (s1 * c1.r - s2 * c2.r) / d;
  const b = Math.sqrt(Math.max(0, 1 - a * a));
  const n = add(scale(dir, a), scale(right, b));
  return {
    t1: add(c1, scale(n, s1 * c1.r)),
    t2: add(c2, scale(n, s2 * c2.r)),
  };
}

// --- Segment / disk intersection (parametric t along segment a→b) ---

function intersectSegmentDisk(a: Vec2, b: Vec2, c: Circle): { t: number } | null {
  const d = sub(b, a);
  const f = sub(a, c as Vec2);
  const dd = dot(d, d);
  if (dd < 1e-12) return null;
  const fd = dot(f, d);
  const ff = dot(f, f) - c.r * c.r;
  const disc = fd * fd - dd * ff;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t0 = (-fd - sq) / dd;
  const t1 = (-fd + sq) / dd;
  if (t1 < 0 || t0 > 1) return null;
  return { t: Math.max(0, t0) };
}

// --- Rubber band path ---

function rubberBandPath(
  ctx: CanvasRenderingContext2D,
  contacts: ContactPeg[],
  floaters: Circle[],
  clearance: number,
): void {
  const expanded = expandWithFloaters(contacts, floaters, clearance);
  const n = expanded.length;
  if (n < 2) return;

  const edges = expanded.map((cp, i) => {
    const next = expanded[(i + 1) % n];
    return getRoleAwareTangent(
      cp.circle,
      next.circle,
      cp.role === 'convex' ? 'outside' : 'inside',
      next.role === 'convex' ? 'outside' : 'inside',
    );
  });

  ctx.beginPath();
  const firstArrival = edges[n - 1].t2;
  ctx.moveTo(firstArrival.x, firstArrival.y);

  for (let i = 0; i < n; i++) {
    const cp = expanded[i];
    const c = cp.circle;
    const arrival = edges[(i - 1 + n) % n].t2;
    const departure = edges[i].t1;

    const aAngle = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const dAngle = Math.atan2(departure.y - c.y, departure.x - c.x);

    // Convex pegs: short arc on outside (clockwise in canvas Y-down).
    // Concave pegs: short arc on inside (anticlockwise in canvas Y-down).
    const anticlockwise = cp.role === 'concave';
    ctx.arc(c.x, c.y, c.r, aAngle, dAngle, anticlockwise);
    ctx.lineTo(edges[i].t2.x, edges[i].t2.y);
  }

  ctx.closePath();
}

// Inserts floater circles as convex contacts wherever the current tangent
// segments cross them, inflated by `clearance` so the stroke's full
// thickness clears the floater rather than just the centerline.
// Iterates passes so newly-created sub-segments are re-checked against the
// remaining floaters (cascading detection).
function expandWithFloaters(
  contacts: ContactPeg[],
  floaters: Circle[],
  clearance: number,
): ContactPeg[] {
  if (floaters.length === 0) return contacts;

  let result: ContactPeg[] = [...contacts];
  const remaining = new Set<Circle>(floaters);
  const maxPasses = floaters.length + 1;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (remaining.size === 0) break;

    const next: ContactPeg[] = [];
    const n = result.length;
    let inserted = false;

    for (let i = 0; i < n; i++) {
      next.push(result[i]);
      const a = result[i];
      const b = result[(i + 1) % n];

      const { t1, t2 } = getRoleAwareTangent(
        a.circle,
        b.circle,
        a.role === 'convex' ? 'outside' : 'inside',
        b.role === 'convex' ? 'outside' : 'inside',
      );

      const hits: { t: number; circle: Circle }[] = [];
      for (const f of remaining) {
        const inflated: Circle = { x: f.x, y: f.y, r: f.r + clearance };
        if (intersectSegmentDisk(t1, t2, inflated) === null) continue;
        const seg = sub(t2, t1);
        const proj =
          dot(sub({ x: f.x, y: f.y }, t1), seg) /
          Math.max(dot(seg, seg), 1e-12);
        hits.push({ t: Math.max(0, Math.min(1, proj)), circle: f });
      }

      hits.sort((x, y) => x.t - y.t);
      for (const h of hits) {
        next.push({ circle: h.circle, role: 'convex' });
        remaining.delete(h.circle);
        inserted = true;
      }
    }

    result = next;
    if (!inserted) break;
  }

  return result;
}
