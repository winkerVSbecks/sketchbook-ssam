import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { quadtree as d3Quadtree } from 'd3-quadtree';
import type { Quadtree, QuadtreeLeaf } from 'd3-quadtree';
import { cuspPalette } from '../../colors/cusphanger';
import type { OklchColor } from 'cusphanger';

/**
 * Verlet band — haberdashery's rubber band given mass. The pegs and the band's
 * route round them (hull pegs outside, dent pegs inside) are haberdashery's,
 * but the band is a closed chain of verlet particles held together by soft
 * distance constraints shorter than the route, so it is under tension. Pegs
 * push the chain out of their halos with a little friction, and the chain
 * keeps itself from crossing through a quadtree (soft-body's collision). As
 * the pegs drift round a loop the band slides, stretches and ripples behind
 * them; its stroke thins where it is stretched and the gaps cut into it sit
 * at fixed particles, so they spread apart with the strain.
 */

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
interface Peg extends Circle {
  homeX: number;
  homeY: number;
  /** Where the drift puts the peg at the end of the current frame. */
  toX: number;
  toY: number;
  /** Displacement per substep. */
  vx: number;
  vy: number;
  seed: number;
  color: OklchColor;
}
interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  index: number;
  /** Peg the particle rests on this substep, or -1. */
  contact: number;
}

const config = {
  count: 16,
  dentCount: 4,
  minR: 18,
  maxR: 130,
  spread: 0.8,
  strokeWidth: 12,
  dotRadius: 7,
  /** Particle spacing along the initial wrapped route, px. */
  spacing: 9,
  /** Rest length / route length: below 1 pre-tensions the band. */
  slack: 0.85,
  stiffness: 0.25,
  iterations: 8,
  substeps: 3,
  damping: 0.994,
  /** Per-substep speed cap, px. */
  maxSpeed: 4,
  friction: 0.2,
  driftFactor: 0.05,
  /** Frames the band settles round the still pegs before the loop is pre-run. */
  settleFrames: 300,
  bevelLayers: 6,
  bevelStrength: 0.14,
  gapEvery: 10,
  gapLength: 3,
};

const TAU = Math.PI * 2;

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = cuspPalette({ ground: 'dark', count: 3 });
  const bg = palette.bg.css;
  const bandColor = palette.tiers.high[0].color;

  const halfCS = config.strokeWidth / 2;
  const driftAmt = width * config.driftFactor;
  const totalFrames = Math.round(((settings.duration ?? 12_000) / 1000) * (settings.playFps ?? 60));

  // --- Pegs: haberdashery's placement, roles and contact order ------------------

  const usableW = width * config.spread;
  const usableH = height * config.spread;
  const xLo = (width - usableW) / 2;
  const yLo = (height - usableH) / 2;

  const pegs: Peg[] = [];
  for (let attempts = 0; pegs.length < config.count && attempts < config.count * 200; attempts++) {
    const r = mapRange(Math.pow(Random.value(), 1.8), 0, 1, config.minR, config.maxR);
    const margin = r + halfCS + driftAmt * 0.5;
    const x = Random.range(xLo + margin, xLo + usableW - margin);
    const y = Random.range(yLo + margin, yLo + usableH - margin);
    // Room for the band to pass between any two pegs at the extremes of drift.
    const clear = (p: Peg) =>
      Math.hypot(p.x - x, p.y - y) > p.r + r + config.strokeWidth * 2 + driftAmt;
    if (!pegs.every(clear)) continue;
    const ramp = Random.pick(palette.ramps);
    const color = ramp[Math.round(Random.range(0.35, 0.85) * (ramp.length - 1))];
    pegs.push({ x, y, r, homeX: x, homeY: y, toX: x, toY: y, vx: 0, vy: 0, seed: Random.range(0, 100), color });
  }

  const halos = (): Circle[] => pegs.map((p) => ({ x: p.x, y: p.y, r: p.r + halfCS }));

  const hull = convexHull(pegs);
  const hullSet = new Set(hull);
  const interior = Random.shuffle(pegs.map((_, i) => i).filter((i) => !hullSet.has(i)));
  const dented = new Set<number>(interior.slice(0, config.dentCount));
  const roles: Role[] = pegs.map((_, i) =>
    hullSet.has(i) ? 'convex' : dented.has(i) ? 'concave' : 'floater',
  );

  // Hull traversal, each dent spliced in where it least lengthens the cycle,
  // then 2-opt until no two centre-to-centre edges cross.
  const order = [...hull];
  for (const idx of pegs.map((_, i) => i).filter((i) => roles[i] === 'concave')) {
    const p = pegs[idx];
    let bestPos = 1;
    let bestCost = Infinity;
    for (let i = 0; i < order.length; i++) {
      const a = pegs[order[i]];
      const b = pegs[order[(i + 1) % order.length]];
      const cost =
        Math.hypot(a.x - p.x, a.y - p.y) +
        Math.hypot(p.x - b.x, p.y - b.y) -
        Math.hypot(a.x - b.x, a.y - b.y);
      if (cost < bestCost) {
        bestCost = cost;
        bestPos = i + 1;
      }
    }
    order.splice(bestPos, 0, idx);
  }
  untangle(order, pegs);

  // --- Band: a closed verlet chain laid along the wrapped route -----------------

  const haloCircles = halos();
  const route = wrappedRoute(
    order.map((i) => ({ circle: haloCircles[i], role: roles[i] as 'convex' | 'concave' })),
    config.spacing / 2,
  );
  const seeds = resampleClosed(route, config.spacing);
  const band: Particle[] = seeds.map((p, index) => ({
    x: p.x,
    y: p.y,
    px: p.x,
    py: p.y,
    index,
    contact: -1,
  }));
  const N = band.length;
  const rest = config.spacing * config.slack;
  // Second-neighbour spacing below which the chain resists folding — a rubber
  // band bends freely but doesn't crease.
  const bendRest = rest * 1.8;

  // A closed path through noise space, so the drift loops with the playhead.
  const drift = (p: Peg, t: number): Vec2 => {
    const a = TAU * t;
    return {
      x: Random.noise3D(Math.cos(a) + p.seed, Math.sin(a), p.seed, 1.1),
      y: Random.noise3D(Math.cos(a), Math.sin(a) + p.seed, -p.seed, 1.1),
    };
  };
  const aimPegs = (t: number) => {
    for (const p of pegs) {
      // Measured from the drift at t = 0, so the pegs start where the band was laid.
      const d = drift(p, t);
      const d0 = drift(p, 0);
      p.toX = p.homeX + (d.x - d0.x) * driftAmt;
      p.toY = p.homeY + (d.y - d0.y) * driftAmt;
      p.vx = (p.toX - p.x) / config.substeps;
      p.vy = (p.toY - p.y) / config.substeps;
    }
  };

  const satisfyDistance = (a: Particle, b: Particle, target: number, k: number, pushOnly: boolean) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6 || (pushOnly && d >= target)) return;
    const f = ((d - target) / d) * 0.5 * k;
    a.x += dx * f;
    a.y += dy * f;
    b.x -= dx * f;
    b.y -= dy * f;
  };

  // Segment against halo, not just particle against halo: a taut band would
  // otherwise slip between two particles straddling a small peg. The closest
  // point on the segment is pushed back to the halo, shared between the two
  // ends by how near it lies to each.
  const collidePegs = () => {
    for (let i = 0; i < N; i++) {
      const a = band[i];
      const b = band[(i + 1) % N];
      const sx = b.x - a.x;
      const sy = b.y - a.y;
      const s2 = sx * sx + sy * sy || 1e-9;
      for (let j = 0; j < pegs.length; j++) {
        const p = pegs[j];
        const R = p.r + halfCS;
        const u = Math.min(1, Math.max(0, ((p.x - a.x) * sx + (p.y - a.y) * sy) / s2));
        const cx = a.x + sx * u - p.x;
        const cy = a.y + sy * u - p.y;
        const d2 = cx * cx + cy * cy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2);
        let nx: number;
        let ny: number;
        if (d > 1e-6) {
          nx = cx / d;
          ny = cy / d;
        } else {
          const sl = Math.sqrt(s2);
          nx = -sy / sl;
          ny = sx / sl;
        }
        const push = R - d;
        const wa = 1 - u;
        const wb = u;
        const k = push / (wa * wa + wb * wb);
        a.x += nx * k * wa;
        a.y += ny * k * wa;
        b.x += nx * k * wb;
        b.y += ny * k * wb;
        if (wa > 0.3) a.contact = j;
        if (wb > 0.3) b.contact = j;
      }
    }
  };

  const collideSelf = () => {
    const tree: Quadtree<Particle> = d3Quadtree<Particle>()
      .x((q) => q.x)
      .y((q) => q.y)
      .addAll(band);
    const minD = config.strokeWidth;
    for (const q of band) {
      for (const o of findInRadius(tree, q, minD)) {
        if (o.index <= q.index) continue;
        const gap = Math.abs(o.index - q.index);
        if (Math.min(gap, N - gap) < 3) continue;
        satisfyDistance(q, o, minD, 1, true);
      }
    }
  };

  const applyFriction = () => {
    for (const q of band) {
      if (q.contact < 0) continue;
      const p = pegs[q.contact];
      const nx0 = q.x - p.x;
      const ny0 = q.y - p.y;
      const nl = Math.hypot(nx0, ny0) || 1;
      const nx = nx0 / nl;
      const ny = ny0 / nl;
      // Velocity relative to the peg's surface, tangential part only.
      const vx = q.x - q.px - p.vx;
      const vy = q.y - q.py - p.vy;
      const vn = vx * nx + vy * ny;
      q.px += (vx - vn * nx) * config.friction;
      q.py += (vy - vn * ny) * config.friction;
    }
  };

  const stepFrame = (t: number) => {
    aimPegs(t);
    for (let s = 0; s < config.substeps; s++) {
      // Pegs advance a substep at a time so they push the band, not jump it.
      for (const p of pegs) {
        p.x += p.vx;
        p.y += p.vy;
      }
      for (const q of band) {
        // Damped, and capped well under the smallest halo so nothing tunnels.
        const sp = Math.hypot(q.x - q.px, q.y - q.py);
        const cap = sp > config.maxSpeed ? config.maxSpeed / sp : 1;
        const vx = (q.x - q.px) * config.damping * cap;
        const vy = (q.y - q.py) * config.damping * cap;
        q.px = q.x;
        q.py = q.y;
        q.x += vx;
        q.y += vy;
        q.contact = -1;
      }
      for (let it = 0; it < config.iterations; it++) {
        for (let i = 0; i < N; i++) {
          satisfyDistance(band[i], band[(i + 1) % N], rest, config.stiffness, false);
          satisfyDistance(band[i], band[(i + 2) % N], bendRest, 0.3, true);
        }
        collidePegs();
      }
      collideSelf();
      collidePegs();
      applyFriction();
    }
  };

  // Settle round the still pegs, then run one whole loop of drift so the first
  // visible frame is already the band's steady response to it.
  aimPegs(0);
  for (const p of pegs) {
    p.x = p.toX;
    p.y = p.toY;
  }
  for (let f = 0; f < config.settleFrames; f++) stepFrame(0);
  for (let f = 0; f < totalFrames; f++) stepFrame(f / totalFrames);

  // --- Drawing -------------------------------------------------------------------

  const shade = (c: OklchColor, dl: number) =>
    `oklch(${Math.min(0.99, Math.max(0, c.l + dl)).toFixed(4)} ${c.c.toFixed(4)} ${(c.h ?? 0).toFixed(2)})`;
  const bandShades = Array.from({ length: config.bevelLayers }, (_, k) => {
    const t = config.bevelLayers === 1 ? 0 : k / (config.bevelLayers - 1);
    return {
      color: shade(bandColor, mapRange(t, 0, 1, -config.bevelStrength * 1.6, config.bevelStrength * 0.6)),
      scale: mapRange(t, 0, 1, 1, 0.12),
    };
  });
  const rimDark = shade(palette.bg.color, -0.08);
  const rimLight = shade(palette.bg.color, 0.3);
  // Width is strokeWidth at the strain of the wrapped route (1 / slack) and
  // thins as 1/√strain — the cross-section a stretched band would keep.
  const w0 = config.strokeWidth / Math.sqrt(config.slack);

  let lastFrame = -1;

  wrap.render = ({ width, height, frame, playhead }: SketchProps) => {
    if (frame !== lastFrame) {
      stepFrame(playhead);
      lastFrame = frame;
    }

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.lineCap = 'round';
    for (const layer of bandShades) {
      context.strokeStyle = layer.color;
      for (let i = 0; i < N; i++) {
        const a = band[i];
        const b = band[(i + 1) % N];
        const strain = Math.hypot(b.x - a.x, b.y - a.y) / rest;
        context.lineWidth = Math.max(0.5, (w0 / Math.sqrt(Math.max(strain, 0.2))) * layer.scale);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }

    // Gaps cut at fixed particles: they ride with the material and spread
    // apart where the band is stretched.
    context.lineCap = 'butt';
    context.strokeStyle = bg;
    context.lineWidth = config.gapLength;
    for (let i = 0; i < N; i += config.gapEvery) {
      const prev = band[(i - 1 + N) % N];
      const next = band[(i + 1) % N];
      const q = band[i];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      const hx = (-ty / tl) * config.strokeWidth;
      const hy = (tx / tl) * config.strokeWidth;
      context.beginPath();
      context.moveTo(q.x - hx, q.y - hy);
      context.lineTo(q.x + hx, q.y + hy);
      context.stroke();
    }

    for (const p of pegs) {
      const gradient = context.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
      gradient.addColorStop(0, shade(p.color, config.bevelStrength));
      gradient.addColorStop(1, shade(p.color, -config.bevelStrength));
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(p.x, p.y, p.r, 0, TAU);
      context.fill();

      context.fillStyle = bg;
      context.beginPath();
      context.arc(p.x, p.y, config.dotRadius, 0, TAU);
      context.fill();

      context.lineCap = 'butt';
      context.strokeStyle = rimDark;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(p.x, p.y, config.dotRadius - 1, (13 * Math.PI) / 12, (23 * Math.PI) / 12);
      context.stroke();

      context.strokeStyle = rimLight;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(p.x, p.y, config.dotRadius + 0.75, Math.PI / 4, (3 * Math.PI) / 4);
      context.stroke();
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 12000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);

// --- Route geometry (from haberdashery) -------------------------------------------

function convexHull(pts: Vec2[]): number[] {
  const n = pts.length;
  if (n < 3) return pts.map((_, i) => i);
  const idx = pts.map((_, i) => i).sort((a, b) => pts[a].x - pts[b].x || pts[a].y - pts[b].y);
  const cross = (o: number, a: number, b: number) =>
    (pts[a].x - pts[o].x) * (pts[b].y - pts[o].y) - (pts[a].y - pts[o].y) * (pts[b].x - pts[o].x);
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

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// 2-opt: reverse the run between any two crossing edges until none cross.
function untangle(order: number[], pts: Vec2[]): void {
  const cap = Math.max(40, order.length * order.length);
  let improved = true;
  for (let iter = 0; improved && iter < cap; iter++) {
    improved = false;
    const m = order.length;
    search: for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        if (
          segmentsCross(pts[order[i]], pts[order[i + 1]], pts[order[j]], pts[order[(j + 1) % m]])
        ) {
          const run = order.slice(i + 1, j + 1).reverse();
          order.splice(i + 1, run.length, ...run);
          improved = true;
          break search;
        }
      }
    }
  }
}

// Tangent between two circles by contact role: s = +1 wraps the outside of a
// circle, −1 dips into its inside. The normal n satisfies
// dot(c2 − c1, n) = s1·r1 − s2·r2; tangent points are c + s·r·n.
function roleTangent(c1: Circle, c2: Circle, s1: number, s2: number): { t1: Vec2; t2: Vec2 } {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { t1: { x: c1.x, y: c1.y }, t2: { x: c2.x, y: c2.y } };
  const ux = dx / d;
  const uy = dy / d;
  const a = (s1 * c1.r - s2 * c2.r) / d;
  const b = Math.sqrt(Math.max(0, 1 - a * a));
  const nx = ux * a + uy * b;
  const ny = uy * a - ux * b;
  return {
    t1: { x: c1.x + nx * s1 * c1.r, y: c1.y + ny * s1 * c1.r },
    t2: { x: c2.x + nx * s2 * c2.r, y: c2.y + ny * s2 * c2.r },
  };
}

// The rubber-band route as a closed polyline: an arc round each contact (with
// the rotation for its role) joined to the next by their tangent.
function wrappedRoute(contacts: ContactPeg[], step: number): Vec2[] {
  const n = contacts.length;
  const sign = (cp: ContactPeg) => (cp.role === 'convex' ? 1 : -1);
  const edges = contacts.map((cp, i) => {
    const next = contacts[(i + 1) % n];
    return roleTangent(cp.circle, next.circle, sign(cp), sign(next));
  });
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const { circle: c, role } = contacts[i];
    const arrival = edges[(i - 1 + n) % n].t2;
    const departure = edges[i].t1;
    const a = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const d = Math.atan2(departure.y - c.y, departure.x - c.x);
    const wrapAngle = (x: number) => ((x % TAU) + TAU) % TAU;
    const sweep = role === 'convex' ? wrapAngle(d - a) : -wrapAngle(a - d);
    const steps = Math.max(1, Math.ceil((Math.abs(sweep) * c.r) / step));
    for (let k = 0; k <= steps; k++) {
      const ang = a + (sweep * k) / steps;
      pts.push({ x: c.x + Math.cos(ang) * c.r, y: c.y + Math.sin(ang) * c.r });
    }
  }
  return pts;
}

function resampleClosed(pts: Vec2[], spacing: number): Vec2[] {
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[n];
  const count = Math.max(8, Math.round(total / spacing));
  const out: Vec2[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const s = (total * k) / count;
    while (cum[seg + 1] < s) seg++;
    const a = pts[seg];
    const b = pts[(seg + 1) % n];
    const len = cum[seg + 1] - cum[seg] || 1;
    const u = (s - cum[seg]) / len;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

// --- Quadtree neighbourhood (from soft-body/verlet-collision-quadtree) -------------

function findInRadius<T extends Vec2>(tree: Quadtree<T>, p: Vec2, radius: number): T[] {
  const found: T[] = [];
  const r2 = radius * radius;
  tree.visit((node, x1, y1, x2, y2) => {
    if (!node.length) {
      // A leaf chains every point that shares its cell through `next`.
      let leaf: QuadtreeLeaf<T> | undefined = node as QuadtreeLeaf<T>;
      while (leaf) {
        const dx = leaf.data.x - p.x;
        const dy = leaf.data.y - p.y;
        if (dx * dx + dy * dy <= r2) found.push(leaf.data);
        leaf = leaf.next;
      }
      return;
    }
    const cx = Math.max(x1, Math.min(p.x, x2));
    const cy = Math.max(y1, Math.min(p.y, y2));
    return (p.x - cx) ** 2 + (p.y - cy) ** 2 > r2;
  });
  return found;
}
