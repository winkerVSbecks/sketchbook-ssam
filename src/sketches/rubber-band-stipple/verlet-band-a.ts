/**
 * verlet-band-a — haberdashery's rubber band given mass.
 *
 * The pegs are laid out the haberdashery way (hull pegs the band wraps,
 * a few interior pegs it dents around, the rest floating), but the band is no
 * longer a tangent path recomputed each frame. It is a closed verlet chain
 * seeded on that path with a rest length shorter than the path, so it sits in
 * tension, and pegs are hard disks it collides with (with a little grip, so
 * spans can't instantly equalise). Self-contact runs through a d3 quadtree as
 * in soft-body/verlet-collision-quadtree. As the pegs drift and breathe the
 * band lags, stretches and ripples: width thins and tone pales with local
 * stretch, and the dash gaps are pinned to material points, so they spread
 * apart where the rubber is pulled and bunch where it slackens.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { converter, formatCss, interpolate } from 'culori';
import { quadtree as d3Quadtree } from 'd3-quadtree';
import { cuspPalette } from '../../colors/cusphanger';

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
interface Peg {
  home: Vec2;
  r0: number;
  role: Role;
  color: string;
  // current (drifted) disk and its displacement over the last substep
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
}
interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  contact: Peg | null;
}

const config = {
  count: 15,
  dentCount: 4,
  minR: 22,
  maxR: 120,
  spread: 0.86,
  bandWidth: 16,
  // particle spacing along the seeded path, px
  spacing: 8,
  // rest length as a fraction of the seeded spacing: < 1 puts the band in tension
  slack: 0.72,
  stiffness: 1,
  bendStiffness: 0.04,
  iterations: 32,
  substeps: 3,
  damping: 0.993,
  grip: 0.55,
  drift: 0.045,
  breathe: 0.18,
  settleSteps: 360,
  // fraction of the loop simulated before frame one
  preRoll: 0.15,
  // each peg swells once per loop, sharply, to twang the band
  twang: 0.14,
  dashEvery: 22,
  bevelLayers: 6,
  bevelStrength: 0.14,
  dotRadius: 6,
};

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = cuspPalette({ ground: 'dark', count: 3, angle: Random.range(40, 90) });
  const bg = palette.bg.css;
  const bandRamp = interpolate([palette.tiers.mid[0].css, palette.tiers.high[0].css], 'oklch');
  const toOklch = converter('oklch');
  const shiftL = (color: string, dl: number): string => {
    const c = toOklch(color)!;
    return formatCss({ ...c, l: Math.min(1, Math.max(0, c.l + dl)) });
  };

  const halfW = config.bandWidth / 2;

  // --- Peg layout (haberdashery's contact topology, without its fixups) ---

  const usableW = width * config.spread;
  const usableH = height * config.spread;
  const xLo = (width - usableW) / 2;
  const yLo = (height - usableH) / 2;
  const xHi = xLo + usableW;
  const yHi = yLo + usableH;
  const margin = config.maxR * 0.6;
  const minDist = ((Math.min(usableW, usableH) - 2 * margin) / Math.sqrt(config.count)) * 0.8;

  const homes: Vec2[] = [];
  for (let attempts = 0; homes.length < config.count && attempts < config.count * 60; attempts++) {
    const pt = {
      x: Random.range(xLo + margin, xHi - margin),
      y: Random.range(yLo + margin, yHi - margin),
    };
    if (!homes.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)) homes.push(pt);
  }

  const circles: Circle[] = homes.map((p) => ({
    x: p.x,
    y: p.y,
    r: mapRange(Random.noise2D(p.x / 260, p.y / 260), -1, 1, config.minR, config.maxR, true),
  }));
  relaxDisks(circles, config.bandWidth * 2.5, 48);

  const hull = convexHullOfDisks(circles);
  const hullSet = new Set(hull);
  const interior = Random.shuffle(
    circles.map((_, i) => i).filter((i) => !hullSet.has(i)),
  ) as number[];
  const dented = new Set(interior.slice(0, Math.min(config.dentCount, interior.length)));
  const roles: Role[] = circles.map((_, i) =>
    hullSet.has(i) ? 'convex' : dented.has(i) ? 'concave' : 'floater',
  );

  // Cheapest insertion of each dent peg into the hull cycle, then 2-opt so
  // no two centre-to-centre edges cross (haberdashery's ordering).
  const order = [...hull];
  for (const idx of [...dented]) {
    const p = circles[idx];
    let bestPos = 1;
    let bestCost = Infinity;
    for (let i = 0; i < order.length; i++) {
      const a = circles[order[i]];
      const b = circles[order[(i + 1) % order.length]];
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
  untangle(order, circles);

  // --- Seed the chain on the role-aware tangent path ---

  // A dent peg too close to its neighbours makes the tangent path loop round
  // it and cross itself; the chain would keep that knot, so demote dents to
  // floaters until the seed path is simple.
  const halos = circles.map((c) => ({ ...c, r: c.r + halfW }));
  const seedFor = () =>
    resampleClosed(
      bandPolyline(
        pruneLassos(
          expandWithFloaters(
            order.map((i) => ({ circle: halos[i], role: roles[i] })),
            halos.filter((_, i) => roles[i] === 'floater'),
          ),
        ),
      ),
      config.spacing,
    );
  let seedPath = seedFor();
  while (selfIntersects(seedPath)) {
    const dent = order.findLast((i) => roles[i] === 'concave');
    if (dent === undefined) break;
    order.splice(order.indexOf(dent), 1);
    roles[dent] = 'floater';
    seedPath = seedFor();
  }
  const pegColors = [...palette.tiers.low, ...palette.tiers.mid.slice(1)];
  const pegs: Peg[] = circles.map((c, i) => ({
    home: { x: c.x, y: c.y },
    r0: c.r,
    role: roles[i],
    color:
      roles[i] === 'concave'
        ? palette.tiers.mid[1 % palette.tiers.mid.length].css
        : Random.pick(pegColors).css,
    x: c.x,
    y: c.y,
    r: c.r,
    dx: 0,
    dy: 0,
  }));
  const seeds = pegs.map(() => Random.range(0, 1000));
  const phases = pegs.map(() => Random.value());

  const particles: Particle[] = seedPath.map((p) => ({
    x: p.x,
    y: p.y,
    px: p.x,
    py: p.y,
    contact: null,
  }));
  const n = particles.length;
  const restLength = config.spacing * config.slack;

  // --- Pegs drift on a seamless loop of the playhead ---

  const placePegs = (playhead: number) => {
    const a = Math.PI * 2 * playhead;
    const cx = Math.cos(a) * 1.3;
    const cy = Math.sin(a) * 1.3;
    const amp = config.drift * width;
    const next: Circle[] = pegs.map((p, i) => ({
      x: p.home.x + amp * Random.noise3D(seeds[i], cx, cy),
      y: p.home.y + amp * Random.noise3D(seeds[i] + 71.3, cx, cy),
      r:
        p.r0 *
        (1 +
          config.breathe * Random.noise3D(seeds[i] + 37.1, cx * 1.4, cy * 1.4) +
          config.twang * pulse(playhead, phases[i])),
    }));
    relaxDisks(next, config.bandWidth * 2.5, 6);
    pegs.forEach((p, i) => {
      p.dx = next[i].x - p.x;
      p.dy = next[i].y - p.y;
      p.x = next[i].x;
      p.y = next[i].y;
      p.r = next[i].r;
    });
  };

  // --- Verlet step ---

  // Self-contact through a quadtree: non-neighbouring stretches of the band
  // keep a band's width apart where dents fold it close to itself or two
  // strands share the gap between pegs.
  const selfContact = () => {
    const tree = d3Quadtree<number>()
      .x((i) => particles[i].x)
      .y((i) => particles[i].y)
      .addAll(particles.map((_, i) => i));
    const minSep = config.bandWidth;
    for (let i = 0; i < n; i++) {
      const a = particles[i];
      tree.visit((node, x1, y1, x2, y2) => {
        if (!node.length) {
          let leaf: typeof node | undefined = node;
          while (leaf && !leaf.length) {
            const j = (leaf as { data: number }).data;
            const gap = Math.abs(i - j);
            if (j > i && Math.min(gap, n - gap) > 4) {
              const b = particles[j];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const d = Math.hypot(dx, dy);
              if (d < minSep && d > 1e-6) {
                const push = (minSep - d) * 0.5;
                a.x -= (dx / d) * push;
                a.y -= (dy / d) * push;
                b.x += (dx / d) * push;
                b.y += (dy / d) * push;
              }
            }
            leaf = (leaf as { next?: typeof node }).next;
          }
          return false;
        }
        return x1 > a.x + minSep || x2 < a.x - minSep || y1 > a.y + minSep || y2 < a.y - minSep;
      });
    }
  };

  const step = () => {
    for (const p of particles) {
      const vx = (p.x - p.px) * config.damping;
      const vy = (p.y - p.py) * config.damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy;
      p.contact = null;
    }

    for (let it = 0; it < config.iterations; it++) {
      // stretch springs between neighbours
      for (let i = 0; i < n; i++) {
        satisfy(particles[i], particles[(i + 1) % n], restLength, config.stiffness);
      }
      // a whisper of bending so the chain doesn't zig-zag at its own scale
      for (let i = 0; i < n; i++) {
        satisfy(particles[i], particles[(i + 2) % n], restLength * 2, config.bendStiffness);
      }
      if (it % 8 === 7) selfContact();
      // pegs are hard disks
      for (const p of particles) {
        for (const peg of pegs) {
          const dx = p.x - peg.x;
          const dy = p.y - peg.y;
          const R = peg.r + halfW;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2) || 1e-6;
          p.x = peg.x + (dx / d) * R;
          p.y = peg.y + (dy / d) * R;
          p.contact = peg;
        }
      }
    }

    // Grip: a particle resting on a peg loses part of its motion relative to
    // that peg, so the band drags along with a drifting peg and spans can hold
    // different stretches instead of equalising instantly.
    for (const p of particles) {
      const peg = p.contact;
      if (!peg) continue;
      const rx = p.x - p.px - peg.dx;
      const ry = p.y - p.py - peg.dy;
      const nx = (p.x - peg.x) / (peg.r + halfW);
      const ny = (p.y - peg.y) / (peg.r + halfW);
      const tn = rx * -ny + ry * nx;
      p.x -= -ny * tn * config.grip;
      p.y -= nx * tn * config.grip;
    }

    selfContact();
  };

  // Pegs move in substep slices so the band sees small, collidable motions.
  const advance = (playhead: number) => {
    const prev = pegs.map((p) => ({ x: p.x, y: p.y, r: p.r }));
    placePegs(playhead);
    const target = pegs.map((p) => ({ x: p.x, y: p.y, r: p.r }));
    for (let s = 1; s <= config.substeps; s++) {
      const f = s / config.substeps;
      pegs.forEach((p, i) => {
        const x = prev[i].x + (target[i].x - prev[i].x) * f;
        const y = prev[i].y + (target[i].y - prev[i].y) * f;
        p.dx = x - p.x;
        p.dy = y - p.y;
        p.x = x;
        p.y = y;
        p.r = prev[i].r + (target[i].r - prev[i].r) * f;
      });
      step();
    }
  };

  // Let the band take up its tension around the pose a little before the
  // loop's start, then run that last stretch of the loop so frame one already
  // carries the lag and uneven stretch of a band that has been moving.
  const frames = (settings.duration! / 1000) * settings.playFps!;
  const preRoll = Math.round(frames * config.preRoll);
  placePegs(1 - config.preRoll);
  pegs.forEach((p) => {
    p.dx = 0;
    p.dy = 0;
  });
  for (let s = 0; s < config.settleSteps; s++) step();
  for (let f = 1; f <= preRoll; f++) advance(1 - config.preRoll + (f / preRoll) * config.preRoll);

  // --- Drawing ---

  const stretch = new Float32Array(n);
  const drawBand = () => {
    for (let i = 0; i < n; i++) {
      const a = particles[(i - 1 + n) % n];
      const b = particles[i];
      const c = particles[(i + 1) % n];
      stretch[i] = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / (2 * restLength);
    }
    // smooth the stretch along the band so width doesn't flicker per link
    const smooth = new Float32Array(n);
    const k = 6;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -k; j <= k; j++) s += stretch[(i + j + n) % n];
      smooth[i] = s / (2 * k + 1);
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += smooth[i];
    mean /= n;

    context.lineCap = 'round';
    const layers = config.bevelLayers;
    for (let layer = 0; layer < layers; layer++) {
      const t = layers === 1 ? 0 : layer / (layers - 1);
      const widthScale = mapRange(t, 0, 1, 1, 0.12);
      const dl = mapRange(t, 0, 1, -config.bevelStrength, config.bevelStrength);
      for (let i = 0; i < n; i++) {
        if (i % config.dashEvery === 0) continue;
        const a = particles[i];
        const b = particles[(i + 1) % n];
        const lambda = smooth[i] / mean;
        // rubber thins as it stretches (cross-section ∝ 1/λ), exaggerated
        const w = config.bandWidth * Math.min(1.6, Math.max(0.25, Math.pow(lambda, -3)));
        const tone = mapRange(lambda, 0.9, 1.12, 0, 1, true);
        context.strokeStyle = shiftL(formatCss(bandRamp(tone)), dl);
        context.lineWidth = w * widthScale;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
  };

  const drawPegs = () => {
    const rimDark = shiftL(bg, -0.06);
    const rimLight = shiftL(bg, 0.35);
    for (const peg of pegs) {
      const g = context.createLinearGradient(peg.x - peg.r, peg.y - peg.r, peg.x + peg.r, peg.y + peg.r);
      g.addColorStop(0, shiftL(peg.color, config.bevelStrength));
      g.addColorStop(1, shiftL(peg.color, -config.bevelStrength));
      context.fillStyle = g;
      context.beginPath();
      context.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = bg;
      context.beginPath();
      context.arc(peg.x, peg.y, config.dotRadius, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = rimDark;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(peg.x, peg.y, config.dotRadius - 1, (13 * Math.PI) / 12, (23 * Math.PI) / 12);
      context.stroke();

      context.strokeStyle = rimLight;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(peg.x, peg.y, config.dotRadius + 0.75, Math.PI / 4, (3 * Math.PI) / 4);
      context.stroke();
    }
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    advance(playhead);
    drawBand();
    drawPegs();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 12_000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);

// Fast swell and slower release once per loop, wrapping at the seam.
function pulse(playhead: number, phase: number): number {
  const t = (((playhead - phase) % 1) + 1) % 1;
  const attack = 0.025;
  const release = 0.12;
  if (t < attack) return Math.sin((t / attack) * Math.PI * 0.5);
  if (t < attack + release) return 0.5 + 0.5 * Math.cos(((t - attack) / release) * Math.PI);
  return 0;
}

// --- Constraints ---

function satisfy(a: Particle, b: Particle, rest: number, stiffness: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const diff = ((d - rest) / d) * 0.5 * stiffness;
  a.x += dx * diff;
  a.y += dy * diff;
  b.x -= dx * diff;
  b.y -= dy * diff;
}

// Pair-separate overlapping disks (plus a gap) so the band always fits between.
function relaxDisks(circles: Circle[], gap: number, iterations: number) {
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.r + b.r + gap;
        if (d >= minD || d < 1e-6) continue;
        const overlap = minD - d;
        const aShare = b.r / (a.r + b.r);
        a.x -= (dx / d) * overlap * aShare;
        a.y -= (dy / d) * overlap * aShare;
        b.x += (dx / d) * overlap * (1 - aShare);
        b.y += (dy / d) * overlap * (1 - aShare);
      }
    }
  }
}

// --- Band seed path (from haberdashery) ---

interface ContactPeg {
  circle: Circle;
  role: Role;
}

// Tangent between two circles; side +1 wraps the outside (convex), -1 dips
// inside (concave). dot(c2 - c1, n) = s1·r1 - s2·r2 fixes the normal n.
function roleTangent(c1: Circle, c2: Circle, s1: number, s2: number) {
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

// A floater the seed path would cut through joins the band as a convex
// contact, inserted along the edge it crosses (haberdashery's expansion), so
// the chain never starts inside a peg.
function expandWithFloaters(contacts: ContactPeg[], floaters: Circle[]): ContactPeg[] {
  const m = contacts.length;
  const side = (c: ContactPeg) => (c.role === 'concave' ? -1 : 1);
  const added = new Set<Circle>();
  const out: ContactPeg[] = [];
  for (let i = 0; i < m; i++) {
    out.push(contacts[i]);
    const a = contacts[i];
    const b = contacts[(i + 1) % m];
    const { t1, t2 } = roleTangent(a.circle, b.circle, side(a), side(b));
    const sx = t2.x - t1.x;
    const sy = t2.y - t1.y;
    const ss = Math.max(sx * sx + sy * sy, 1e-12);
    const hits: { t: number; circle: Circle }[] = [];
    for (const f of floaters) {
      if (added.has(f)) continue;
      const t = Math.max(0, Math.min(1, ((f.x - t1.x) * sx + (f.y - t1.y) * sy) / ss));
      if (Math.hypot(t1.x + sx * t - f.x, t1.y + sy * t - f.y) < f.r) hits.push({ t, circle: f });
    }
    hits.sort((x, y) => x.t - y.t);
    for (const h of hits) {
      out.push({ circle: h.circle, role: 'convex' });
      added.add(h.circle);
    }
  }
  return out;
}

// Arcs round each contact joined by tangent lines, as a dense closed polyline.
// Where the band arrives on each contact and how far it wraps round it:
// clockwise (positive) round convex pegs, anticlockwise inside concave ones.
function contactArcs(contacts: ContactPeg[]) {
  const m = contacts.length;
  const side = (c: ContactPeg) => (c.role === 'concave' ? -1 : 1);
  const edges = contacts.map((c, i) => {
    const next = contacts[(i + 1) % m];
    return roleTangent(c.circle, next.circle, side(c), side(next));
  });
  const TAU = Math.PI * 2;
  const arcs = contacts.map(({ circle: c, role }, i) => {
    const arrival = edges[(i - 1 + m) % m].t2;
    const departure = edges[i].t1;
    const a0 = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const a1 = Math.atan2(departure.y - c.y, departure.x - c.x);
    const sweep =
      role === 'concave' ? -((((a0 - a1) % TAU) + TAU) % TAU) : (((a1 - a0) % TAU) + TAU) % TAU;
    return { a0, sweep };
  });
  return { edges, arcs };
}

// A contact the band barely grazes can come out with its tangents crossed,
// which reads as a near-full turn: a lasso the chain would keep. Such a peg
// isn't really holding the band, so drop it and let the neighbours close up.
function pruneLassos(contacts: ContactPeg[]): ContactPeg[] {
  const out = [...contacts];
  while (out.length > 3) {
    const { arcs } = contactArcs(out);
    const lasso = arcs.findIndex((a) => Math.abs(a.sweep) > Math.PI * 1.6);
    if (lasso < 0) break;
    out.splice(lasso, 1);
  }
  return out;
}

function bandPolyline(contacts: ContactPeg[]): Vec2[] {
  const m = contacts.length;
  const { edges, arcs } = contactArcs(contacts);
  const pts: Vec2[] = [];
  for (let i = 0; i < m; i++) {
    const c = contacts[i].circle;
    const { a0, sweep } = arcs[i];
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) * c.r) / 2));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (sweep * s) / steps;
      pts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
    }
    pts.push(edges[i].t2);
  }
  return pts;
}

function resampleClosed(pts: Vec2[], spacing: number): Vec2[] {
  const m = pts.length;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[m];
  const count = Math.max(8, Math.round(total / spacing));
  const out: Vec2[] = [];
  let seg = 0;
  for (let k = 0; k < count; k++) {
    const s = (k / count) * total;
    while (cum[seg + 1] < s) seg++;
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    const f = (s - cum[seg]) / Math.max(cum[seg + 1] - cum[seg], 1e-9);
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

// --- Topology helpers (from haberdashery) ---

function selfIntersects(pts: Vec2[]): boolean {
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % m], pts[j], pts[(j + 1) % m])) return true;
    }
  }
  return false;
}

// Reverse a stretch of the cycle whenever two non-adjacent edges cross.
function untangle(order: number[], circles: Circle[]) {
  const cap = Math.max(40, order.length * order.length);
  let improved = true;
  for (let iter = 0; improved && iter < cap; iter++) {
    improved = false;
    const m = order.length;
    outer: for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        const a = circles[order[i]];
        const b = circles[order[(i + 1) % m]];
        const c = circles[order[j]];
        const d = circles[order[(j + 1) % m]];
        if (segmentsCross(a, b, c, d)) {
          const slice = order.slice(i + 1, j + 1).reverse();
          for (let k = 0; k < slice.length; k++) order[i + 1 + k] = slice[k];
          improved = true;
          break outer;
        }
      }
    }
  }
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

// Andrew's monotone chain over the disk centres.
function convexHullOfDisks(circles: Circle[]): number[] {
  if (circles.length < 3) return circles.map((_, i) => i);
  const idx = circles.map((_, i) => i).sort((a, b) => circles[a].x - circles[b].x || circles[a].y - circles[b].y);
  const cross = (o: number, a: number, b: number) =>
    (circles[a].x - circles[o].x) * (circles[b].y - circles[o].y) -
    (circles[a].y - circles[o].y) * (circles[b].x - circles[o].x);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}
