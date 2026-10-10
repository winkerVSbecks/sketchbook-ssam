import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { formatCss } from 'culori';
import { cuspPalette } from '../../colors/cusphanger';
import type { CuspSwatch } from '../../colors/cusphanger';

// haberdashery's band, given mass. The contact order (convex hull, cheapest
// insertion of the concave pegs, 2-opt) is computed once as in haberdashery;
// the band path it describes is then sampled into a closed verlet chain whose
// rest length is shorter than the path, so the chain is under tension. Each
// frame the pegs drift and breathe, the chain integrates, its links pull it
// taut and the peg discs push it back out: it settles, stretches, lags and
// ripples instead of being recomputed.

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
interface Peg {
  home: Vec2;
  baseR: number;
  phase: number;
  swatch: CuspSwatch;
}
interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
}

const config = {
  count: 15,
  dentCount: 4,
  minR: 26,
  maxR: 120,
  spread: 0.78,
  strokeWidth: 14,
  particles: 360,
  tension: 0.86,
  stiffness: 0.9,
  damping: 0.994,
  iterations: 14,
  substeps: 3,
  drift: 46,
  breathe: 0.22,
  bevelLayers: 7,
  bevelStrength: 0.16,
  tickEvery: 6,
};

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
  const shade = (s: CuspSwatch, dl: number): string =>
    formatCss({ ...s.color, l: Math.min(1, Math.max(0, s.color.l + dl)) });
  const bandSwatch = palette.tiers.high[0];
  const pegSwatches = [...palette.tiers.mid, ...palette.tiers.low];

  const halfCS = config.strokeWidth / 2;
  const usableW = width * config.spread;
  const usableH = height * config.spread;
  const xLo = (width - usableW) / 2;
  const yLo = (height - usableH) / 2;

  // --- pegs: dart-throw positions, noise radii -----------------------------
  const margin = config.maxR * 0.6;
  const minDist = ((Math.min(usableW, usableH) - 2 * margin) / Math.sqrt(config.count)) * 0.8;
  const homes: Vec2[] = [];
  for (let a = 0; homes.length < config.count && a < config.count * 60; a++) {
    const p = {
      x: Random.range(xLo + margin, xLo + usableW - margin),
      y: Random.range(yLo + margin, yLo + usableH - margin),
    };
    if (!homes.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < minDist)) homes.push(p);
  }
  const pegs: Peg[] = homes.map((home, i) => {
    const n = Random.noise2D(home.x / 300, home.y / 300);
    return {
      home,
      baseR: mapRange(n, -1, 1, config.minR, Math.min(config.maxR, minDist * 0.42), true),
      phase: Random.value(),
      swatch: pegSwatches[i % pegSwatches.length],
    };
  });

  // Pegs drift on a closed noise loop so the motion repeats every duration.
  const pegCircles = (playhead: number): Circle[] =>
    pegs.map((p, i) => {
      const a = Math.PI * 2 * playhead;
      const ca = Math.cos(a) * 0.9;
      const sa = Math.sin(a) * 0.9;
      const dx = Random.noise3D(ca, sa, i * 7.1);
      const dy = Random.noise3D(ca + 31, sa - 17, i * 7.1);
      const br = Random.noise3D(ca - 9, sa + 5, i * 3.3 + p.phase);
      return {
        x: p.home.x + dx * config.drift,
        y: p.home.y + dy * config.drift,
        r: p.baseR * (1 + br * config.breathe),
      };
    });

  // --- contact order, as in haberdashery ------------------------------------
  const hullOrder = convexHull(homes);
  const hullSet = new Set(hullOrder);
  const interior = homes.map((_, i) => i).filter((i) => !hullSet.has(i));
  const shuffled = Random.shuffle(interior) as number[];
  const dented = new Set(shuffled.slice(0, Math.min(config.dentCount, interior.length)));
  const roles: Role[] = homes.map((_, i) =>
    hullSet.has(i) ? 'convex' : dented.has(i) ? 'concave' : 'floater',
  );
  const order = [...hullOrder];
  for (let idx = 0; idx < homes.length; idx++) {
    if (roles[idx] !== 'concave') continue;
    const p = homes[idx];
    let best = 1;
    let bestCost = Infinity;
    for (let i = 0; i < order.length; i++) {
      const a = homes[order[i]];
      const b = homes[order[(i + 1) % order.length]];
      const cost = dist(a, p) + dist(p, b) - dist(a, b);
      if (cost < bestCost) {
        bestCost = cost;
        best = i + 1;
      }
    }
    order.splice(best, 0, idx);
  }
  twoOpt(order, homes);

  // --- the chain --------------------------------------------------------------
  const start = pegCircles(0).map((c) => ({ ...c, r: c.r + halfCS + 1 }));
  const contacts: ContactPeg[] = order.map((i) => ({
    circle: start[i],
    role: roles[i] as 'convex' | 'concave',
  }));
  const floaters = roles.flatMap((r, i) => (r === 'floater' ? [start[i]] : []));
  const outline = resample(bandPolyline(expandWithFloaters(contacts, floaters)), config.particles);
  const chain: Particle[] = outline.map((p) => ({ x: p.x, y: p.y, px: p.x, py: p.y }));
  const pathLength = outline.reduce((s, p, i) => s + dist(p, outline[(i + 1) % outline.length]), 0);
  const restLength = (pathLength / chain.length) * config.tension;

  const step = (circles: Circle[]) => {
    for (const p of chain) {
      const vx = (p.x - p.px) * config.damping;
      const vy = (p.y - p.py) * config.damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
    }
    const n = chain.length;
    for (let it = 0; it < config.iterations; it++) {
      for (let i = 0; i < n; i++) {
        const a = chain[i];
        const b = chain[(i + 1) % n];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const k = ((d - restLength) / d) * 0.5 * config.stiffness;
        a.x += dx * k;
        a.y += dy * k;
        b.x -= dx * k;
        b.y -= dy * k;
      }
      // Pegs are solid: push any particle that has entered a halo back to its rim.
      for (const p of chain) {
        for (const c of circles) {
          const r = c.r + halfCS;
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2) || 1e-6;
          p.x = c.x + (dx / d) * r;
          p.y = c.y + (dy / d) * r;
        }
      }
    }
  };

  // Settle before the first frame so the band starts at rest on its pegs.
  const restCircles = pegCircles(0);
  for (let i = 0; i < 400; i++) step(restCircles);

  let lastPlayhead = 0;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    // Advance the physics through the playhead interval, wrapping at the loop.
    let delta = playhead - lastPlayhead;
    if (delta < 0) delta += 1;
    if (delta > 0.05) delta = 0.05;
    for (let s = 1; s <= config.substeps; s++) {
      step(pegCircles(lastPlayhead + (delta * s) / config.substeps));
    }
    lastPlayhead = playhead;
    const circles = pegCircles(playhead);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Pegs.
    circles.forEach((c, i) => {
      const s = pegs[i].swatch;
      const g = context.createLinearGradient(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r);
      g.addColorStop(0, shade(s, config.bevelStrength * 0.6));
      g.addColorStop(1, shade(s, -config.bevelStrength));
      context.fillStyle = g;
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = bg;
      context.beginPath();
      context.arc(c.x, c.y, 6, 0, Math.PI * 2);
      context.fill();
    });

    // Band: smooth closed curve through the particles, stroked as a bevelled tube.
    const n = chain.length;
    const band = new Path2D();
    const mid = (i: number): Vec2 => {
      const a = chain[i % n];
      const b = chain[(i + 1) % n];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const m0 = mid(0);
    band.moveTo(m0.x, m0.y);
    for (let i = 1; i <= n; i++) {
      const p = chain[i % n];
      const m = mid(i);
      band.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    band.closePath();

    context.lineJoin = 'round';
    context.lineCap = 'round';
    const layers = config.bevelLayers;
    for (let k = 0; k < layers; k++) {
      const t = k / (layers - 1);
      context.lineWidth = mapRange(t, 0, 1, config.strokeWidth, config.strokeWidth * 0.12);
      context.strokeStyle = shade(bandSwatch, mapRange(t, 0, 1, -config.bevelStrength, config.bevelStrength));
      context.stroke(band);
    }

    // Material ticks: fixed particles along the band, so stretch reads as their spacing.
    context.strokeStyle = bg;
    context.lineWidth = 1.5;
    context.beginPath();
    for (let i = 0; i < n; i += config.tickEvery) {
      const a = chain[(i - 1 + n) % n];
      const b = chain[(i + 1) % n];
      const p = chain[i];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      const nx = (-ty / tl) * halfCS * 0.8;
      const ny = (tx / tl) * halfCS * 0.8;
      context.moveTo(p.x - nx, p.y - ny);
      context.lineTo(p.x + nx, p.y + ny);
    }
    context.stroke();
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

// --- geometry -----------------------------------------------------------------

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function convexHull(pts: Vec2[]): number[] {
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
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

// Reverse segments of the cycle until no two centre-to-centre edges cross.
function twoOpt(order: number[], pts: Vec2[]): void {
  const m = order.length;
  for (let iter = 0, improved = true; improved && iter < m * m; iter++) {
    improved = false;
    search: for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        const a = pts[order[i]];
        const b = pts[order[(i + 1) % m]];
        const c = pts[order[j]];
        const d = pts[order[(j + 1) % m]];
        if (segmentsCross(a, b, c, d)) {
          const slice = order.slice(i + 1, j + 1).reverse();
          for (let k = 0; k < slice.length; k++) order[i + 1 + k] = slice[k];
          improved = true;
          break search;
        }
      }
    }
  }
}

// Tangent between two circles; 'outside' wraps the exterior, 'inside' dips in.
function tangent(c1: Circle, c2: Circle, out1: boolean, out2: boolean): { t1: Vec2; t2: Vec2 } {
  const s1 = out1 ? 1 : -1;
  const s2 = out2 ? 1 : -1;
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

function segmentHitsDisk(a: Vec2, b: Vec2, c: Circle): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dd = dx * dx + dy * dy;
  if (dd < 1e-12) return false;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / dd));
  return Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y) < c.r;
}

function expandWithFloaters(contacts: ContactPeg[], floaters: Circle[]): ContactPeg[] {
  const result: ContactPeg[] = [];
  const added = new Set<Circle>();
  const n = contacts.length;
  for (let i = 0; i < n; i++) {
    const a = contacts[i];
    const b = contacts[(i + 1) % n];
    result.push(a);
    const { t1, t2 } = tangent(a.circle, b.circle, a.role === 'convex', b.role === 'convex');
    const hits = floaters
      .filter((f) => !added.has(f) && segmentHitsDisk(t1, t2, f))
      .map((f) => ({ f, t: (f.x - t1.x) * (t2.x - t1.x) + (f.y - t1.y) * (t2.y - t1.y) }))
      .sort((x, y) => x.t - y.t);
    for (const h of hits) {
      result.push({ circle: h.f, role: 'convex' });
      added.add(h.f);
    }
  }
  return result;
}

// The haberdashery band as a dense polyline: arcs round each contact, tangents between.
function bandPolyline(expanded: ContactPeg[]): Vec2[] {
  const n = expanded.length;
  const edges = expanded.map((cp, i) => {
    const next = expanded[(i + 1) % n];
    return tangent(cp.circle, next.circle, cp.role === 'convex', next.role === 'convex');
  });
  const pts: Vec2[] = [];
  const TAU = Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const { circle: c, role } = expanded[i];
    const arrive = edges[(i - 1 + n) % n].t2;
    const depart = edges[i].t1;
    const a0 = Math.atan2(arrive.y - c.y, arrive.x - c.x);
    const a1 = Math.atan2(depart.y - c.y, depart.x - c.x);
    // Convex pegs sweep clockwise on screen (increasing angle), concave the other way.
    const sweep =
      role === 'convex' ? (((a1 - a0) % TAU) + TAU) % TAU : -((((a0 - a1) % TAU) + TAU) % TAU);
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * c.r) / 3));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (sweep * s) / steps;
      pts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
    }
  }
  return pts;
}

function resample(pts: Vec2[], count: number): Vec2[] {
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + dist(pts[i], pts[(i + 1) % n]));
  const total = cum[n];
  const out: Vec2[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    while (cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (target - cum[j]) / seg;
    const a = pts[j];
    const b = pts[(j + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}
