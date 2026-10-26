import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { converter, formatCss } from 'culori';
import { quadtree as d3Quadtree } from 'd3-quadtree';
import { logColors } from '../../colors';
import { cuspPalette } from '../../colors/cusphanger';

/**
 * verlet-band-d — haberdashery's band as a real verlet chain. The pegs and
 * their contact order come from haberdashery (hull + cheapest-insertion dents
 * + 2-opt), but the band is only built from that tangent path once: after that
 * it is a closed ring of particles with springs shorter than the wrap, so it
 * sits stretched around the pegs and is held there by collision, not geometry.
 * The pegs drift on looping noise; the band slides with friction, lags, and
 * rings. Material marks are painted on the rubber, so they travel with it and
 * spread apart where it stretches; the band also thins where it is pulled.
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
interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const DURATION = 12_000;
const FPS = 60;

const config = {
  count: 15,
  dentCount: 4,
  minR: 24,
  maxR: 120,
  spread: 0.8,
  /** Band thickness at its nominal stretch. */
  bandWidth: 16,
  /** Particles in the ring. */
  particles: 600,
  /** Wrapped length over rest length: how far the band is pulled on. */
  preStretch: 1.5,
  stiffness: 0.3,
  bend: 0.04,
  iterations: 6,
  damping: 0.01,
  /** Fraction of tangential slip against a peg removed each step. */
  friction: 0.85,
  substeps: 3,
  /** Peg drift amplitude in px. */
  drift: 70,
  /** Band half-width ∝ stretch^-thinning (rubber keeps its volume). */
  thinning: 1.4,
  markEvery: 8,
  /** Recorded positions per mark in its stipple trail, and steps between them. */
  trail: 40,
  trailEvery: 4,
  bevelLayers: 6,
  bevel: 0.08,
  dotRadius: 7,
};

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  const palette = cuspPalette({ ground: 'dark', count: 3 });
  logColors(palette.colors);
  const bg = palette.bg.css;
  const bandBase = palette.tiers.high[0].css;
  const pegColors = palette.tiers.mid.map((s) => s.css);

  const toOklch = converter('oklch');
  const shiftL = (css: string, dl: number): string => {
    const c = toOklch(css)!;
    return formatCss({ ...c, l: Math.min(1, Math.max(0, c.l + dl)) });
  };

  const halfW = config.bandWidth / 2;
  const usableW = width * config.spread;
  const usableH = height * config.spread;
  const bounds: Bounds = {
    x0: (width - usableW) / 2,
    y0: (height - usableH) / 2,
    x1: (width + usableW) / 2,
    y1: (height + usableH) / 2,
  };
  // Room between two pegs for two strands of band to pass.
  const clearance = config.bandWidth * 2 + 6;

  // --- Peg layout (haberdashery) ---

  const margin = config.maxR + 4;
  const minDist =
    ((Math.min(usableW, usableH) - 2 * margin) / Math.sqrt(config.count)) * 0.75;
  const positions: Vec2[] = [];
  let attempts = 0;
  while (positions.length < config.count && attempts < config.count * 40) {
    attempts++;
    const pt = {
      x: Random.range(bounds.x0 + margin, bounds.x1 - margin),
      y: Random.range(bounds.y0 + margin, bounds.y1 - margin),
    };
    if (!positions.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)) {
      positions.push(pt);
    }
  }

  const baseCircles: Circle[] = positions.map((p) => ({
    x: p.x,
    y: p.y,
    r: mapRange(Random.noise2D(p.x, p.y, 0.0025), -1, 1, config.minR, config.maxR, true),
  }));
  relax(baseCircles, clearance, 24, bounds);

  // Each peg drifts on a closed loop through 4D noise, so the drift loops
  // with the playhead; then overlaps are relaxed from scratch so the peg
  // layout is a pure function of time.
  const driftSeeds = baseCircles.map(() => ({
    a: Random.range(0, 100),
    b: Random.range(0, 100),
  }));
  const pegsAt = (t: number): Circle[] => {
    const ang = Math.PI * 2 * t;
    const cz = Math.cos(ang) * 0.8;
    const cw = Math.sin(ang) * 0.8;
    const pegs = baseCircles.map((c, i) => {
      const { a, b } = driftSeeds[i];
      return {
        x: c.x + config.drift * Random.noise4D(a, 0, cz, cw),
        y: c.y + config.drift * Random.noise4D(b, 7, cz, cw),
        r: c.r,
      };
    });
    relax(pegs, clearance, 8, bounds);
    return pegs;
  };

  // --- The band: a closed verlet chain seeded on haberdashery's path ---

  const N = config.particles;
  const px = new Float64Array(N);
  const py = new Float64Array(N);
  const ox = new Float64Array(N);
  const oy = new Float64Array(N);
  const contact = new Int32Array(N).fill(-1);

  // Haberdashery's contact cycle can still cross itself once the tangents
  // are offset from the centres; a real band would start tangled, so try
  // other dents (and then fewer of them) until the wrap is a simple loop.
  const halo = (c: Circle): Circle => ({ x: c.x, y: c.y, r: c.r + halfW + 1 });
  let pegsPrev = pegsAt(0);
  let pegsNow = pegsPrev;
  const halos = pegsNow.map(halo);
  const hullOrder = convexHullOfCentres(baseCircles);
  const hullSet = new Set(hullOrder);
  const allIndices = baseCircles.map((_, i) => i);
  const interior = allIndices.filter((i) => !hullSet.has(i));
  let wrapPath: Vec2[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const dentCount = Math.max(0, config.dentCount - Math.floor(attempt / 8));
    const dented = new Set(Random.shuffle(interior).slice(0, dentCount));
    const roles: Role[] = allIndices.map((i) =>
      hullSet.has(i) ? 'convex' : dented.has(i) ? 'concave' : 'floater',
    );
    const contacts: ContactPeg[] = contactCycle(baseCircles, hullOrder, roles).map((i) => ({
      circle: halos[i],
      role: roles[i] as 'convex' | 'concave',
    }));
    const floaters = allIndices.filter((i) => roles[i] === 'floater').map((i) => halos[i]);
    wrapPath = bandPolyline(expandWithFloaters(contacts, floaters));
    if (!selfCrosses(wrapPath)) break;
  }
  resampleClosed(wrapPath, N).forEach((p, i) => {
    px[i] = ox[i] = p.x;
    py[i] = oy[i] = p.y;
  });
  let wrapped = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    wrapped += Math.hypot(px[j] - px[i], py[j] - py[i]);
  }
  const rest = wrapped / N / config.preStretch;

  // Neighbours this close along the ring are joined by springs; only strands
  // farther apart along the band collide with each other.
  const selfMin = config.bandWidth * 0.95;
  const selfSkip = Math.ceil((selfMin * 2) / rest) + 2;

  const collidePegs = () => {
    for (let i = 0; i < N; i++) {
      contact[i] = -1;
      for (let k = 0; k < pegsNow.length; k++) {
        const c = pegsNow[k];
        const R = c.r + halfW + 1;
        const dx = px[i] - c.x;
        const dy = py[i] - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 1e-6;
        px[i] = c.x + (dx / d) * R;
        py[i] = c.y + (dy / d) * R;
        contact[i] = k;
      }
    }
  };

  // Strand-against-strand: where a dent pinches two runs of band together
  // they press side by side instead of passing through each other. A
  // quadtree over the ring finds the candidates.
  const collideSelf = () => {
    const tree = d3Quadtree<number>()
      .x((i) => px[i])
      .y((i) => py[i])
      .addAll(Array.from({ length: N }, (_, i) => i));
    for (let i = 0; i < N; i++) {
      const qx = px[i];
      const qy = py[i];
      tree.visit((node, x0, y0, x1, y1) => {
        if ('data' in node) {
          let leaf: typeof node | undefined = node;
          while (leaf) {
            const j = leaf.data;
            const gap = Math.abs(i - j);
            if (j > i && Math.min(gap, N - gap) > selfSkip) {
              const dx = px[j] - px[i];
              const dy = py[j] - py[i];
              const d = Math.hypot(dx, dy);
              if (d < selfMin && d > 1e-6) {
                const push = (selfMin - d) / d / 2;
                px[i] -= dx * push;
                py[i] -= dy * push;
                px[j] += dx * push;
                py[j] += dy * push;
              }
            }
            leaf = leaf.next;
          }
        }
        return x0 > qx + selfMin || x1 < qx - selfMin || y0 > qy + selfMin || y1 < qy - selfMin;
      });
    }
  };

  const simulate = (t: number) => {
    pegsPrev = pegsNow;
    pegsNow = pegsAt(t);

    const damp = 1 - config.damping;
    for (let i = 0; i < N; i++) {
      const vx = (px[i] - ox[i]) * damp;
      const vy = (py[i] - oy[i]) * damp;
      ox[i] = px[i];
      oy[i] = py[i];
      px[i] += vx;
      py[i] += vy;
    }

    for (let it = 0; it < config.iterations; it++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const d = Math.hypot(dx, dy) || 1e-6;
        const k = ((d - rest) / d) * 0.5 * config.stiffness;
        px[i] += dx * k;
        py[i] += dy * k;
        px[j] -= dx * k;
        py[j] -= dy * k;
      }
      // A little bending stiffness so the rubber rounds its corners.
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N;
        const b = (i + 1) % N;
        px[i] += ((px[a] + px[b]) / 2 - px[i]) * config.bend;
        py[i] += ((py[a] + py[b]) / 2 - py[i]) * config.bend;
      }
      if (it === config.iterations - 1) collideSelf();
      collidePegs();
    }

    // Friction: a particle touching a peg loses part of its slip relative to
    // that peg's surface, so the band drags along with a drifting peg and
    // the stretch stops being uniform between spans.
    for (let i = 0; i < N; i++) {
      const k = contact[i];
      if (k < 0) continue;
      const c = pegsNow[k];
      const rvx = px[i] - ox[i] - (c.x - pegsPrev[k].x);
      const rvy = py[i] - oy[i] - (c.y - pegsPrev[k].y);
      const nx = px[i] - c.x;
      const ny = py[i] - c.y;
      const nl = Math.hypot(nx, ny) || 1e-6;
      const rn = (rvx * nx + rvy * ny) / (nl * nl);
      const tx = rvx - nx * rn;
      const ty = rvy - ny * rn;
      ox[i] += tx * config.friction;
      oy[i] += ty * config.friction;
    }
  };

  // Steps are tied to the playhead, not to frames: a jump (export, scrub,
  // loop) simulates forward to it, wrapping round the loop if needed.
  const stepsPerLoop = Math.round((DURATION / 1000) * FPS * config.substeps);
  let step = 0;
  // Every mark leaves a stipple trail of where it has been: dots strung
  // along the band are slip, dots fanned across it are ripple and lag.
  const marks = Math.floor(N / config.markEvery);
  const trailX = new Float64Array(config.trail * marks);
  const trailY = new Float64Array(config.trail * marks);
  let trailHead = 0;
  let trailCount = 0;
  const record = () => {
    const base = trailHead * marks;
    for (let m = 0; m < marks; m++) {
      trailX[base + m] = px[m * config.markEvery];
      trailY[base + m] = py[m * config.markEvery];
    }
    trailHead = (trailHead + 1) % config.trail;
    trailCount = Math.min(config.trail, trailCount + 1);
  };

  const advanceTo = (target: number) => {
    while (step !== target) {
      step = (step + 1) % stepsPerLoop;
      simulate(step / stepsPerLoop);
      if (step % config.trailEvery === 0) record();
    }
  };

  // Let it snap onto the pegs, then run a whole loop so playhead 0 already
  // holds the steady, periodic motion.
  for (let s = 0; s < 400; s++) simulate(0);
  advanceTo(stepsPerLoop - 1);
  advanceTo(0);

  const hw = new Float64Array(N);
  const nx = new Float64Array(N);
  const ny = new Float64Array(N);

  const ribbon = (f: number): Path2D => {
    const path = new Path2D();
    for (let i = 0; i < N; i++) {
      const x = px[i] + nx[i] * hw[i] * f;
      const y = py[i] + ny[i] * hw[i] * f;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    for (let i = 0; i < N; i++) {
      const x = px[i] - nx[i] * hw[i] * f;
      const y = py[i] - ny[i] * hw[i] * f;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    advanceTo(Math.floor(playhead * stepsPerLoop) % stepsPerLoop);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Local stretch (smoothed over a few links) sets the band's width.
    const seg = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      seg[i] = Math.hypot(px[j] - px[i], py[j] - py[i]);
    }
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) sum += seg[(i + k + N) % N];
      const stretch = sum / 7 / rest / config.preStretch;
      hw[i] = halfW * Math.min(1.6, Math.max(0.3, Math.pow(stretch, -config.thinning)));
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      const tx = px[b] - px[a];
      const ty = py[b] - py[a];
      const tl = Math.hypot(tx, ty) || 1e-6;
      nx[i] = -ty / tl;
      ny[i] = tx / tl;
    }

    context.fillStyle = shiftL(bandBase, -0.1);
    for (let k = 0; k < trailCount; k++) {
      // Oldest first; dots shrink and fade with age.
      const slot = (trailHead - trailCount + k + config.trail) % config.trail;
      const age = 1 - k / trailCount;
      context.globalAlpha = mapRange(age, 0, 1, 0.9, 0.1);
      const r = mapRange(age, 0, 1, 2.2, 0.8);
      context.beginPath();
      for (let m = 0; m < marks; m++) {
        const x = trailX[slot * marks + m];
        const y = trailY[slot * marks + m];
        context.moveTo(x + r, y);
        context.arc(x, y, r, 0, Math.PI * 2);
      }
      context.fill();
    }
    context.globalAlpha = 1;

    // Nested ribbons give the band haberdashery's bevelled tube.
    const n = config.bevelLayers;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : k / (n - 1);
      context.fillStyle = shiftL(bandBase, mapRange(t, 0, 1, -config.bevel, config.bevel));
      context.fill(ribbon(mapRange(t, 0, 1, 1, 0.15)), 'evenodd');
    }

    // Marks painted on the rubber: they ride with the material, so their
    // spacing is the strain.
    context.strokeStyle = bg;
    context.lineWidth = 3;
    context.lineCap = 'butt';
    context.beginPath();
    for (let i = 0; i < marks * config.markEvery; i += config.markEvery) {
      const w = hw[i] + 0.5;
      context.moveTo(px[i] + nx[i] * w, py[i] + ny[i] * w);
      context.lineTo(px[i] - nx[i] * w, py[i] - ny[i] * w);
    }
    context.stroke();

    // Pegs: haberdashery's stipple — bevelled disc, punched centre, rims.
    const rimDark = shiftL(bg, -0.05);
    const rimLight = shiftL(bg, 0.35);
    pegsNow.forEach((c, i) => {
      const base = pegColors[i % pegColors.length];
      const g = context.createLinearGradient(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r);
      g.addColorStop(0, shiftL(base, config.bevel));
      g.addColorStop(1, shiftL(base, -config.bevel));
      context.fillStyle = g;
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
      context.arc(c.x, c.y, config.dotRadius - 1, (13 * Math.PI) / 12, (23 * Math.PI) / 12);
      context.stroke();

      context.strokeStyle = rimLight;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius + 0.75, Math.PI / 4, (3 * Math.PI) / 4);
      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: DURATION,
  framesFormat: ['mp4'],
  playFps: FPS,
  exportFps: FPS,
  attributes: { colorSpace: 'display-p3' },
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
function vlen(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

// Pushes overlapping circles apart along their centrelines (the larger one
// moves less) and keeps them inside the bounds.
function relax(circles: Circle[], gap: number, iterations: number, b: Bounds): void {
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const p = circles[i];
        const q = circles[j];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        const minD = p.r + q.r + gap;
        if (d >= minD || d < 1e-6) continue;
        const overlap = minD - d;
        const ux = dx / d;
        const uy = dy / d;
        const total = p.r + q.r;
        p.x -= ux * overlap * (q.r / total);
        p.y -= uy * overlap * (q.r / total);
        q.x += ux * overlap * (p.r / total);
        q.y += uy * overlap * (p.r / total);
      }
    }
    for (const c of circles) {
      c.x = Math.min(Math.max(c.x, b.x0 + c.r), b.x1 - c.r);
      c.y = Math.min(Math.max(c.y, b.y0 + c.r), b.y1 - c.r);
    }
  }
}

// Open-segment crossing test for 2-opt (shared endpoints don't count).
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

// Andrew's monotone chain over circle centres.
function convexHullOfCentres(circles: Circle[]): number[] {
  if (circles.length < 3) return circles.map((_, i) => i);
  const idx = circles
    .map((_, i) => i)
    .sort((a, b) => circles[a].x - circles[b].x || circles[a].y - circles[b].y);
  const cross3 = (o: number, a: number, b: number): number => {
    const oc = circles[o];
    const ac = circles[a];
    const bc = circles[b];
    return (ac.x - oc.x) * (bc.y - oc.y) - (ac.y - oc.y) * (bc.x - oc.x);
  };
  const chain = (order: number[]): number[] => {
    const out: number[] = [];
    for (const i of order) {
      while (out.length >= 2 && cross3(out[out.length - 2], out[out.length - 1], i) <= 0)
        out.pop();
      out.push(i);
    }
    out.pop();
    return out;
  };
  return chain(idx).concat(chain([...idx].reverse()));
}

// Haberdashery's contact cycle: the hull, each concave peg spliced in where
// it least lengthens the loop, then 2-opt until no two edges cross.
function contactCycle(circles: Circle[], hull: number[], roles: Role[]): number[] {
  const order = [...hull];
  roles.forEach((role, idx) => {
    if (role !== 'concave') return;
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
  });

  const cap = Math.max(40, order.length * order.length);
  let improved = true;
  for (let iter = 0; improved && iter < cap; iter++) {
    improved = false;
    const m = order.length;
    search: for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        const a = circles[order[i]];
        const b = circles[order[(i + 1) % m]];
        const c = circles[order[j]];
        const d = circles[order[(j + 1) % m]];
        if (segmentsCross(a, b, c, d)) {
          const slice = order.slice(i + 1, j + 1).reverse();
          order.splice(i + 1, slice.length, ...slice);
          improved = true;
          break search;
        }
      }
    }
  }
  return order;
}

// Tangent between two circles; 'outside' wraps the band round the circle's
// exterior (convex peg), 'inside' dips it in (concave peg).
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
  const right = { x: dir.y, y: -dir.x };
  const a = (s1 * c1.r - s2 * c2.r) / d;
  const b = Math.sqrt(Math.max(0, 1 - a * a));
  const n = add(scale(dir, a), scale(right, b));
  return { t1: add(c1, scale(n, s1 * c1.r)), t2: add(c2, scale(n, s2 * c2.r)) };
}

function sideOf(p: ContactPeg): 'outside' | 'inside' {
  return p.role === 'convex' ? 'outside' : 'inside';
}

function intersectsSegment(a: Vec2, b: Vec2, c: Circle): boolean {
  const d = sub(b, a);
  const f = sub(a, c);
  const dd = dot(d, d);
  if (dd < 1e-12) return false;
  const fd = dot(f, d);
  const disc = fd * fd - dd * (dot(f, f) - c.r * c.r);
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  return (-fd + sq) / dd >= 0 && (-fd - sq) / dd <= 1;
}

// Floaters the tangent path crosses join it as convex contacts.
function expandWithFloaters(contacts: ContactPeg[], floaters: Circle[]): ContactPeg[] {
  const result: ContactPeg[] = [];
  const added = new Set<Circle>();
  contacts.forEach((a, i) => {
    result.push(a);
    const b = contacts[(i + 1) % contacts.length];
    const { t1, t2 } = getRoleAwareTangent(a.circle, b.circle, sideOf(a), sideOf(b));
    const seg = sub(t2, t1);
    floaters
      .filter((f) => !added.has(f) && intersectsSegment(t1, t2, f))
      .map((f) => ({ f, t: dot(sub(f, t1), seg) / Math.max(dot(seg, seg), 1e-12) }))
      .sort((p, q) => p.t - q.t)
      .forEach(({ f }) => {
        result.push({ circle: f, role: 'convex' });
        added.add(f);
      });
  });
  return result;
}

// Haberdashery's band path as a dense polyline: arc round each peg (clockwise
// outside a convex peg, anticlockwise inside a concave one), straight tangent
// runs between them.
function bandPolyline(expanded: ContactPeg[]): Vec2[] {
  const n = expanded.length;
  const TAU = Math.PI * 2;
  const edges = expanded.map((cp, i) => {
    const next = expanded[(i + 1) % n];
    return getRoleAwareTangent(cp.circle, next.circle, sideOf(cp), sideOf(next));
  });
  const pts: Vec2[] = [];
  expanded.forEach(({ circle: c, role }, i) => {
    const arrival = edges[(i - 1 + n) % n].t2;
    const departure = edges[i].t1;
    const a0 = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const a1 = Math.atan2(departure.y - c.y, departure.x - c.x);
    const sweep =
      role === 'concave' ? -((((a0 - a1) % TAU) + TAU) % TAU) : (((a1 - a0) % TAU) + TAU) % TAU;
    const steps = Math.max(1, Math.ceil((Math.abs(sweep) * c.r) / 2));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (sweep * k) / steps;
      pts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
    }
  });
  return pts;
}

function selfCrosses(pts: Vec2[]): boolean {
  const m = pts.length;
  for (let i = 0; i < m; i++) {
    for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % m], pts[j], pts[(j + 1) % m])) return true;
    }
  }
  return false;
}

// n points spaced evenly by arc length round a closed polyline.
function resampleClosed(pts: Vec2[], n: number): Vec2[] {
  const m = pts.length;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[m];
  const out: Vec2[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (seg < m - 1 && cum[seg + 1] < target) seg++;
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    const len = cum[seg + 1] - cum[seg];
    const t = len > 1e-9 ? (target - cum[seg]) / len : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}
