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
type Role = 'convex' | 'concave' | 'floater';
interface ContactPeg {
  circle: Circle;
  role: 'convex' | 'concave';
}
interface RenderCircle {
  circle: Circle;
  gradient: CanvasGradient;
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
  // Fixed noise time so the precomputed geometry is independent of playhead.
  const SNAPSHOT_T = 0;

  let positions: Vec2[] = [];
  let roles: Role[] = [];
  let contactOrder: number[] = [];
  let floaterIndices: number[] = [];
  let cacheKey = '';

  let renderCircles: RenderCircle[] = [];
  let bandPath: Path2D = new Path2D();

  const ensurePositions = () => {
    const halfCS = config.strokeWidth / 2;
    const key = `${config.count}|${config.maxR}|${config.dentCount}`;
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

    // Provisional circles at maxR for topology-only hull classification
    const provisionalCircles: Circle[] = positions.map((p) => ({
      x: p.x,
      y: p.y,
      r: config.maxR + halfCS,
    }));

    const hullSet = new Set(convexHullOfDisks(provisionalCircles));
    const allIndices = positions.map((_, i) => i);
    const interiorIndices = allIndices.filter((i) => !hullSet.has(i));

    // Shuffle interior indices with seeded Random, then pick dentCount of them
    const shuffled = [...interiorIndices];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Random.value() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const dentCount = Math.min(config.dentCount, interiorIndices.length);
    const dentedSet = new Set(shuffled.slice(0, dentCount));

    roles = allIndices.map((i): Role => {
      if (hullSet.has(i)) return 'convex';
      if (dentedSet.has(i)) return 'concave';
      return 'floater';
    });

    let cx = 0;
    let cy = 0;
    for (const p of positions) {
      cx += p.x;
      cy += p.y;
    }
    cx /= positions.length;
    cy /= positions.length;

    const contactIndices = allIndices.filter((i) => roles[i] !== 'floater');
    contactOrder = [...contactIndices].sort(
      (a, b) =>
        Math.atan2(positions[a].y - cy, positions[a].x - cx) -
        Math.atan2(positions[b].y - cy, positions[b].x - cx),
    );
    floaterIndices = allIndices.filter((i) => roles[i] === 'floater');

    cacheKey = key;
  };

  const computeGeometry = () => {
    ensurePositions();

    const halfCS = config.strokeWidth / 2;

    const circles: Circle[] = positions.map((p) => {
      const t = noise(p.x, p.y, SNAPSHOT_T);
      const r = mapRange(t, -1, 1, config.minR, config.maxR, true);
      const dx = noise(p.x + 500, p.y, SNAPSHOT_T) * driftAmt;
      const dy = noise(p.x, p.y + 500, SNAPSHOT_T) * driftAmt;
      return { x: p.x + dx, y: p.y + dy, r };
    });

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

    // Fixup loop: ensure no halo-halo overlap and no tangent segment of the
    // band crosses through a non-incident circle. For band violations, first
    // try to shrink the offending circle so its halo just clears the segment;
    // if shrinking alone can't clear it (the segment is closer than halfCS +
    // minRadiusFloor), shrink to the floor and nudge perpendicular to the
    // segment to recover the rest. Every contact and floater is in scope —
    // only the two circles incident to the current edge are skipped — because
    // the provisional-radius hull can mis-classify pegs once drift and
    // relaxation move things around.
    const minRadiusFloor = Math.max(2, config.minR * 0.2);
    const fixupPasses = 16;

    for (let pass = 0; pass < fixupPasses; pass++) {
      let changed = false;

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
          if (d >= minD - 0.1 || d < 1e-6) continue;
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
          changed = true;
        }
      }
      for (const c of circles) {
        const r = c.r + halfCS;
        c.x = Math.min(Math.max(c.x, r), width - r);
        c.y = Math.min(Math.max(c.y, r), height - r);
      }

      const haloProbe: Circle[] = circles.map((c) => ({
        x: c.x,
        y: c.y,
        r: c.r + halfCS,
      }));
      if (haloProbe.length < 2 || contactOrder.length < 2) {
        if (!changed) break;
        continue;
      }

      const probeContacts: ContactPeg[] = contactOrder.map((i) => ({
        circle: haloProbe[i],
        role: roles[i] as 'convex' | 'concave',
      }));
      const probeFloaters = floaterIndices.map((i) => haloProbe[i]);
      const expanded = expandWithFloaters(probeContacts, probeFloaters);
      const en = expanded.length;
      if (en < 2) {
        if (!changed) break;
        continue;
      }

      const edges = expanded.map((cp, i) => {
        const next = expanded[(i + 1) % en];
        return getRoleAwareTangent(
          cp.circle,
          next.circle,
          cp.role === 'convex' ? 'outside' : 'inside',
          next.role === 'convex' ? 'outside' : 'inside',
        );
      });

      for (let i = 0; i < circles.length; i++) {
        const haloI = haloProbe[i];
        const c = circles[i];
        for (let e = 0; e < edges.length; e++) {
          const aCircle = expanded[e].circle;
          const bCircle = expanded[(e + 1) % en].circle;
          if (aCircle === haloI || bCircle === haloI) continue;

          const ea = edges[e].t1;
          const eb = edges[e].t2;
          const segVec = sub(eb, ea);
          const segLenSq = dot(segVec, segVec);
          if (segLenSq < 1e-12) continue;
          const tParam = Math.max(
            0,
            Math.min(1, dot(sub({ x: c.x, y: c.y }, ea), segVec) / segLenSq),
          );
          const closest = add(ea, scale(segVec, tParam));
          const distVec = sub({ x: c.x, y: c.y }, closest);
          const dist = vlen(distVec);
          const safeDist = c.r + halfCS;
          if (dist >= safeDist - 0.1) continue;

          if (dist >= halfCS + minRadiusFloor + 0.5) {
            c.r = dist - halfCS - 0.5;
            changed = true;
          } else {
            c.r = minRadiusFloor;
            const needed = minRadiusFloor + halfCS - dist + 0.5;
            let nx: number;
            let ny: number;
            if (dist > 1e-6) {
              nx = distVec.x / dist;
              ny = distVec.y / dist;
            } else {
              const segLen = Math.sqrt(segLenSq);
              nx = -segVec.y / segLen;
              ny = segVec.x / segLen;
            }
            c.x += nx * needed;
            c.y += ny * needed;
            changed = true;
          }
        }
      }

      if (!changed) break;
    }

    const haloCircles: Circle[] = circles.map((c) => ({
      x: c.x,
      y: c.y,
      r: c.r + halfCS,
    }));

    bandPath = new Path2D();
    if (haloCircles.length >= 2 && contactOrder.length >= 2) {
      const contacts: ContactPeg[] = contactOrder.map((i) => ({
        circle: haloCircles[i],
        role: roles[i] as 'convex' | 'concave',
      }));
      const floaters = floaterIndices.map((i) => haloCircles[i]);
      rubberBandPath(bandPath, contacts, floaters);
    }

    renderCircles = circles.map((c) => {
      const t = noise(c.x, c.y, SNAPSHOT_T);
      const baseColor = colorMap(mapRange(t, -1, 1, 0, 1, true));
      const gradient = context.createLinearGradient(
        c.x - c.r,
        c.y - c.r,
        c.x + c.r,
        c.y + c.r,
      );
      gradient.addColorStop(0, shiftLightness(baseColor, config.bevelStrength));
      gradient.addColorStop(
        1,
        shiftLightness(baseColor, -config.bevelStrength),
      );
      return { circle: c, gradient };
    });
  };

  computeGeometry();
  pane.on('change', () => computeGeometry());

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (config.hullFill) {
      context.fillStyle = colorMap(0.5);
      context.fill(bandPath);
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
      context.stroke(bandPath);
    }

    // Stipple pass: precomputed gradient + center dot + rims on every circle.
    const rimDark = shiftLightness(bg, -config.bevelStrength);
    const rimLight = shiftLightness(bg, config.bevelStrength * 5);

    for (const rc of renderCircles) {
      const c = rc.circle;
      context.fillStyle = rc.gradient;
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = bg;
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = rimDark;
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

      context.strokeStyle = rimLight;
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

// --- Convex hull of disk centers (Andrew's monotone chain) ---
// Approximation: uses centers only; valid when radius spread is modest.

function convexHullOfDisks(circles: Circle[]): number[] {
  const n = circles.length;
  if (n < 3) return circles.map((_, i) => i);

  const indices = circles
    .map((_, i) => i)
    .sort((a, b) => {
      const ca = circles[a];
      const cb = circles[b];
      return ca.x !== cb.x ? ca.x - cb.x : ca.y - cb.y;
    });

  const cross3 = (o: number, a: number, b: number): number => {
    const oc = circles[o];
    const ac = circles[a];
    const bc = circles[b];
    return (ac.x - oc.x) * (bc.y - oc.y) - (ac.y - oc.y) * (bc.x - oc.x);
  };

  const lower: number[] = [];
  for (const i of indices) {
    while (
      lower.length >= 2 &&
      cross3(lower[lower.length - 2], lower[lower.length - 1], i) <= 0
    )
      lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = indices.length - 1; k >= 0; k--) {
    const i = indices[k];
    while (
      upper.length >= 2 &&
      cross3(upper[upper.length - 2], upper[upper.length - 1], i) <= 0
    )
      upper.pop();
    upper.push(i);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
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

function intersectSegmentDisk(
  a: Vec2,
  b: Vec2,
  c: Circle,
): { t: number } | null {
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
  path: Path2D,
  contacts: ContactPeg[],
  floaters: Circle[],
): void {
  const expanded = expandWithFloaters(contacts, floaters);
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

  const firstArrival = edges[n - 1].t2;
  path.moveTo(firstArrival.x, firstArrival.y);

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
    path.arc(c.x, c.y, c.r, aAngle, dAngle, anticlockwise);
    path.lineTo(edges[i].t2.x, edges[i].t2.y);
  }

  path.closePath();
}

// Inserts floater circles as convex contacts wherever the current tangent
// segments cross them. Each floater is inserted at most once.
function expandWithFloaters(
  contacts: ContactPeg[],
  floaters: Circle[],
): ContactPeg[] {
  if (floaters.length === 0) return contacts;

  const result: ContactPeg[] = [];
  const n = contacts.length;
  const added = new Set<Circle>();

  for (let i = 0; i < n; i++) {
    result.push(contacts[i]);
    const a = contacts[i];
    const b = contacts[(i + 1) % n];

    const { t1, t2 } = getRoleAwareTangent(
      a.circle,
      b.circle,
      a.role === 'convex' ? 'outside' : 'inside',
      b.role === 'convex' ? 'outside' : 'inside',
    );

    const hits: { t: number; circle: Circle }[] = [];
    for (const f of floaters) {
      if (!added.has(f) && intersectSegmentDisk(t1, t2, f) !== null) {
        const seg = sub(t2, t1);
        const proj =
          dot(sub({ x: f.x, y: f.y }, t1), seg) /
          Math.max(dot(seg, seg), 1e-12);
        hits.push({ t: Math.max(0, Math.min(1, proj)), circle: f });
      }
    }

    hits.sort((x, y) => x.t - y.t);
    for (const h of hits) {
      result.push({ circle: h.circle, role: 'convex' });
      added.add(h.circle);
    }
  }

  return result;
}
