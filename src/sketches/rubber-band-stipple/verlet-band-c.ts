import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { interpolate, formatCss } from 'culori';
import { quadtree as d3Quadtree } from 'd3-quadtree';
import type { QuadtreeLeaf } from 'd3-quadtree';
import { cuspPalette } from '../../colors/cusphanger';

/**
 * verlet-band-c — haberdashery's band given mass. The pegs are laid out and
 * classified exactly as in haberdashery (hull pegs convex, a few interior
 * pegs threaded on the outside as concave dents, floaters left loose), and
 * the band starts on haberdashery's tangent path around their haloes. From
 * there it is no longer a path but a closed verlet chain of beads (the ring
 * from soft-body/verlet-101: neighbour springs plus weak longer ones for a
 * little bending stiffness), laid down longer than its rest length so it is
 * under tension, pushed out of every peg with a little friction and kept off
 * itself with a quadtree (from soft-body/verlet-collision-quadtree). The
 * pegs drift and breathe on a looping noise; the band is dragged, slips,
 * lags and rings in response. Once a loop its rest length eases past the
 * laid length and back, so it slackens off the pegs, buckles into kinks and
 * loops, and is snapped taut again.
 *
 * Three marks make the mass legible in a still frame:
 * - the band's width follows each link's strain (thin where stretched),
 * - ticks ride on fixed beads, so their spacing is the rubber's own stretch
 *   and they slide round the pegs with the material,
 * - hairline ghosts of the band's last few positions trail behind it.
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
/** One bead of the chain: position and previous position (velocity is implicit). */
interface Bead {
  x: number;
  y: number;
  px: number;
  py: number;
  i: number;
}

const config = {
  count: 16,
  dentCount: 4,
  minR: 20,
  maxR: 150,
  spread: 0.8,
  strokeWidth: 12,
  /** Extra clearance between peg haloes so the band can always pass between two pegs. */
  gap: 8,
  /** Peg drift amplitude as a fraction of width. */
  drift: 0.06,
  /** Peg radius swing, ± fraction. */
  breathe: 0.14,
  /** Distance between beads along the band as laid. */
  spacing: 6,
  /**
   * Rest length / laid length, taut → loose: below 1 the band is laid
   * stretched. It eases from the first to the second and back once a loop,
   * so the band slackens off the pegs, buckles, and is snapped taut again.
   */
  slack: [0.8, 1.04] as [number, number],
  stiffness: 1,
  /**
   * verlet-101's longer springs (to the bead `bendSpan` along), kept weak:
   * enough bending stiffness that a slack band buckles into waves rather
   * than crumpling bead by bead.
   */
  bendSpan: 3,
  bendStiffness: 0.1,
  damping: 0.997,
  friction: 0.06,
  substeps: 6,
  iterations: 6,
  /** Frames run with the pegs held still before the pre-roll. */
  settleFrames: 120,
  /** Frames of peg drift run before playhead 0, so the first frame already has history. */
  prerollFrames: 150,
  ghostEvery: 8,
  ghostCount: 16,
  tickEvery: 7,
  dotRadius: 6,
  ringGap: 7,
  lineWidth: 1.5,
};

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = cuspPalette({ count: 3 });
  const bg = palette.bg.css;
  const pegScale = interpolate(
    palette.tiers.mid.map((s) => s.css),
    'oklch',
  );
  const bandColor = palette.tiers.high[0].css;

  const halfCS = config.strokeWidth / 2;
  const driftAmt = width * config.drift;
  const usableW = width * config.spread;
  const usableH = height * config.spread;
  const xLo = (width - usableW) / 2;
  const yLo = (height - usableH) / 2;
  const xHi = xLo + usableW;
  const yHi = yLo + usableH;

  const noise = (x: number, y: number): number =>
    Random.noise4D(x / 100, y / 100, 1, 1, 0.25, 1);

  // --- Peg layout and roles: haberdashery's, unchanged ---

  const margin = config.maxR + 4;
  const minDist =
    ((Math.min(usableW, usableH) - 2 * margin) / Math.sqrt(config.count)) * 0.75;
  const positions: Vec2[] = [];
  let attempts = 0;
  while (positions.length < config.count && attempts < config.count * 40) {
    attempts++;
    const pt = {
      x: Random.range(xLo + margin, xHi - margin),
      y: Random.range(yLo + margin, yHi - margin),
    };
    if (!positions.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < minDist)) {
      positions.push(pt);
    }
  }

  const hullCcwOrder = convexHullOfDisks(
    positions.map((p) => ({ x: p.x, y: p.y, r: config.maxR + halfCS })),
  );
  const hullSet = new Set(hullCcwOrder);
  const allIndices = positions.map((_, i) => i);
  const interior = Random.shuffle(allIndices.filter((i) => !hullSet.has(i))) as number[];
  const dentedSet = new Set(interior.slice(0, Math.min(config.dentCount, interior.length)));
  const roles = allIndices.map((i): Role => {
    if (hullSet.has(i)) return 'convex';
    if (dentedSet.has(i)) return 'concave';
    return 'floater';
  });

  // Cheapest insertion of the concave pegs into the hull cycle, then 2-opt
  // until no two centre-to-centre edges cross.
  const order = [...hullCcwOrder];
  for (const idx of allIndices.filter((i) => roles[i] === 'concave')) {
    const p = positions[idx];
    let bestPos = 1;
    let bestCost = Infinity;
    for (let i = 0; i < order.length; i++) {
      const a = positions[order[i]];
      const b = positions[order[(i + 1) % order.length]];
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
  const twoOptCap = Math.max(40, order.length * order.length);
  let improved = true;
  for (let iter = 0; improved && iter < twoOptCap; iter++) {
    improved = false;
    const m = order.length;
    twoOpt: for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        const a = positions[order[i]];
        const b = positions[order[(i + 1) % m]];
        const c = positions[order[j]];
        const d = positions[order[(j + 1) % m]];
        if (segmentsCross(a, b, c, d)) {
          const slice = order.slice(i + 1, j + 1).reverse();
          for (let k = 0; k < slice.length; k++) order[i + 1 + k] = slice[k];
          improved = true;
          break twoOpt;
        }
      }
    }
  }
  const floaterIndices = allIndices.filter((i) => roles[i] === 'floater');

  const baseR = positions.map((p) =>
    mapRange(noise(p.x, p.y), -1, 1, config.minR, config.maxR, true),
  );
  const pegColors = positions.map((p) =>
    formatCss(pegScale(mapRange(noise(p.x + 300, p.y), -1, 1, 0, 1, true))),
  );

  // --- Pegs over time: drift and breathe on a loop, then push apart ---

  /**
   * Where each peg wants to be at playhead t: a closed loop through 4D noise,
   * so t = 0 and t = 1 coincide.
   */
  const targetAt = (t: number): Circle[] => {
    const a = Math.PI * 2 * t;
    const u = Math.cos(a) * 0.7;
    const v = Math.sin(a) * 0.7;
    return positions.map((p, i) => ({
      x: p.x + Random.noise4D(i * 13.1, 0, u, v) * driftAmt,
      y: p.y + Random.noise4D(i * 13.1, 7.3, u, v) * driftAmt,
      r: baseR[i] * (1 + Random.noise4D(i * 13.1, 19.7, u, v) * config.breathe),
    }));
  };

  /** Push overlapping pegs apart in place, haloes a band's width apart and inside the frame. */
  const relaxPegs = (circles: Circle[], iterations: number) => {
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const p = circles[i];
          const q = circles[j];
          const rp = p.r + halfCS + config.gap / 2;
          const rq = q.r + halfCS + config.gap / 2;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const d = Math.hypot(dx, dy);
          const minD = rp + rq;
          if (d >= minD || d < 1e-6) continue;
          // The larger peg barely moves; the smaller is displaced.
          const overlap = minD - d;
          const pShare = rq / minD;
          const qShare = rp / minD;
          p.x -= (dx / d) * overlap * pShare;
          p.y -= (dy / d) * overlap * pShare;
          q.x += (dx / d) * overlap * qShare;
          q.y += (dy / d) * overlap * qShare;
        }
      }
      for (const c of circles) {
        const r = c.r + halfCS;
        c.x = Math.min(Math.max(c.x, xLo + r), xHi - r);
        c.y = Math.min(Math.max(c.y, yLo + r), yHi - r);
      }
    }
  };

  /**
   * Pegs are bodies too: each frame they move by their target's motion, lean
   * a little toward the target itself, and are pushed apart from where they
   * already were. Resolving overlaps from scratch every frame instead lets
   * pegs that cross each other's paths jump sides, which whips the band.
   */
  let target: Circle[] = [];
  const advancePegs = (from: Circle[], t: number): Circle[] => {
    const next = targetAt(t);
    const moved = from.map((c, i) => ({
      x: c.x + (next[i].x - target[i].x) + (next[i].x - c.x) * 0.01,
      y: c.y + (next[i].y - target[i].y) + (next[i].y - c.y) * 0.01,
      r: next[i].r,
    }));
    target = next;
    relaxPegs(moved, 4);
    return moved;
  };

  // --- The band: laid on haberdashery's tangent path, then made of beads ---

  const loopFrames = Math.round(((settings.duration ?? 12000) / 1000) * (settings.playFps ?? 60));
  const startT = 1 - config.prerollFrames / loopFrames;
  target = targetAt(startT);
  let pegs = target.map((c) => ({ ...c }));
  relaxPegs(pegs, 64);

  const haloes = pegs.map((c) => ({ x: c.x, y: c.y, r: c.r + halfCS }));
  const laid = resampleClosed(
    bandPolyline(
      order.map((i) => ({ circle: haloes[i], role: roles[i] as 'convex' | 'concave' })),
      floaterIndices.map((i) => haloes[i]),
    ),
    config.spacing,
  );
  const beads: Bead[] = laid.map((p, i) => ({ x: p.x, y: p.y, px: p.x, py: p.y, i }));
  const n = beads.length;
  const laidStep = perimeter(laid) / n;
  const restAt = (t: number) =>
    laidStep * mapRange(Math.cos(Math.PI * 2 * t), 1, -1, config.slack[0], config.slack[1]);
  // Beads closer than this along the chain are neighbours, not collisions.
  const selfD = config.strokeWidth * 0.9;
  const selfSkip = Math.ceil(selfD / restAt(0)) + 2;

  const ghosts: Float32Array[] = [];
  let frameCount = 0;

  /** Pull every bead toward the bead `span` along it, to `length`. */
  const spring = (span: number, length: number, stiffness: number) => {
    for (let i = 0; i < n; i++) {
      const a = beads[i];
      const b = beads[(i + span) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9) continue;
      const k = ((d - length) / d) * 0.5 * stiffness;
      a.x += dx * k;
      a.y += dy * k;
      b.x -= dx * k;
      b.y -= dy * k;
    }
  };

  /** Advance the band one frame while the pegs move from `from` to `to`. */
  const step = (from: Circle[], to: Circle[], rest: number) => {
    for (let s = 0; s < config.substeps; s++) {
      const f = (s + 1) / config.substeps;
      const now = from.map((c, k) => ({
        x: c.x + (to[k].x - c.x) * f,
        y: c.y + (to[k].y - c.y) * f,
        r: c.r + (to[k].r - c.r) * f + halfCS,
      }));

      for (const b of beads) {
        const vx = (b.x - b.px) * config.damping;
        const vy = (b.y - b.py) * config.damping;
        b.px = b.x;
        b.py = b.y;
        b.x += vx;
        b.y += vy;
      }

      for (let it = 0; it < config.iterations; it++) {
        // Neighbour springs are the rubber; the weak long springs only stop
        // it folding on itself bead by bead.
        spring(1, rest, config.stiffness);
        spring(config.bendSpan, rest * config.bendSpan, config.bendStiffness);
        const last = it === config.iterations - 1;
        for (const b of beads) {
          for (const c of now) {
            const dx = b.x - c.x;
            const dy = b.y - c.y;
            const dSq = dx * dx + dy * dy;
            if (dSq >= c.r * c.r) continue;
            const d = Math.sqrt(dSq) || 1e-6;
            b.x = c.x + (dx / d) * c.r;
            b.y = c.y + (dy / d) * c.r;
            // Friction: a bead touching a peg loses a little of its velocity,
            // so the band grips, then slips.
            if (last) {
              b.px += (b.x - b.px) * config.friction;
              b.py += (b.y - b.py) * config.friction;
            }
          }
        }
      }

      // Self-collision through a quadtree, skipping chain neighbours.
      const tree = d3Quadtree<Bead>()
        .x((b) => b.x)
        .y((b) => b.y)
        .addAll(beads);
      for (const b of beads) {
        tree.visit((node, x0, y0, x1, y1) => {
          if (!node.length) {
            let leaf: QuadtreeLeaf<Bead> | undefined = node as QuadtreeLeaf<Bead>;
            while (leaf) {
              const o = leaf.data;
              const ring = Math.abs(o.i - b.i);
              if (o.i > b.i && Math.min(ring, n - ring) > selfSkip) {
                const dx = o.x - b.x;
                const dy = o.y - b.y;
                const d = Math.hypot(dx, dy);
                if (d < selfD && d > 1e-6) {
                  const push = ((selfD - d) / d) * 0.5;
                  b.x -= dx * push;
                  b.y -= dy * push;
                  o.x += dx * push;
                  o.y += dy * push;
                }
              }
              leaf = leaf.next;
            }
          }
          return x0 > b.x + selfD || x1 < b.x - selfD || y0 > b.y + selfD || y1 < b.y - selfD;
        });
      }
    }

    frameCount++;
    if (frameCount % config.ghostEvery === 0) {
      const snap = new Float32Array(n * 2);
      beads.forEach((b, i) => {
        snap[i * 2] = b.x;
        snap[i * 2 + 1] = b.y;
      });
      ghosts.push(snap);
      if (ghosts.length > config.ghostCount) ghosts.shift();
    }
  };

  // Settle with the pegs held, then drift up to playhead 0. Ghosts from the
  // settle are dropped: they record the band tightening, not the pegs moving.
  for (let f = 0; f < config.settleFrames; f++) step(pegs, pegs, restAt(startT));
  ghosts.length = 0;
  for (let f = 1; f <= config.prerollFrames; f++) {
    const t = startT + f / loopFrames;
    const next = advancePegs(pegs, t);
    step(pegs, next, restAt(t));
    pegs = next;
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const next = advancePegs(pegs, playhead);
    step(pegs, next, restAt(playhead));
    pegs = next;

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Ghosts: the band's last positions in its own colour, oldest faintest.
    context.strokeStyle = bandColor;
    context.lineWidth = 1;
    context.lineJoin = 'round';
    ghosts.forEach((g, k) => {
      context.globalAlpha = mapRange(k, 0, ghosts.length, 0.1, 0.45);
      context.beginPath();
      context.moveTo(g[0], g[1]);
      for (let i = 1; i < n; i++) context.lineTo(g[i * 2], g[i * 2 + 1]);
      context.closePath();
      context.stroke();
    });
    context.globalAlpha = 1;

    // Pegs: haberdashery-cusp's concentric rings stepping in to a centre dot.
    context.lineWidth = config.lineWidth;
    pegs.forEach((c, i) => {
      context.strokeStyle = pegColors[i];
      for (
        let r = c.r - config.lineWidth - config.ringGap;
        r > config.dotRadius + config.ringGap * 0.5;
        r -= config.ringGap
      ) {
        context.beginPath();
        context.arc(c.x, c.y, r, 0, Math.PI * 2);
        context.stroke();
      }
      context.fillStyle = pegColors[i];
      context.beginPath();
      context.arc(c.x, c.y, config.dotRadius, 0, Math.PI * 2);
      context.fill();
    });

    // Band: one stroke per link, its width falling as the link stretches
    // (relative to the band's mean strain this frame, squared to show it).
    const lens = beads.map((a, i) => {
      const b = beads[(i + 1) % n];
      return Math.hypot(b.x - a.x, b.y - a.y);
    });
    const meanLen = lens.reduce((s, l) => s + l, 0) / n;
    const widths = lens.map(
      (l) => config.strokeWidth * Math.min(2, Math.max(0.3, (meanLen / Math.max(l, 1e-6)) ** 2)),
    );
    context.strokeStyle = bandColor;
    context.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = beads[i];
      const b = beads[(i + 1) % n];
      context.lineWidth = widths[i];
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }

    // Ticks ride on fixed beads: they are the rubber's own material marks.
    context.strokeStyle = bg;
    context.lineWidth = config.lineWidth;
    context.lineCap = 'butt';
    for (let i = 0; i < n; i += config.tickEvery) {
      const prev = beads[(i - 1 + n) % n];
      const next = beads[(i + 1) % n];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      const half = (widths[i] / 2) * 0.8;
      const b = beads[i];
      context.beginPath();
      context.moveTo(b.x - (ty / tl) * half, b.y + (tx / tl) * half);
      context.lineTo(b.x + (ty / tl) * half, b.y - (tx / tl) * half);
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

function perimeter(pts: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) total += vlen(sub(pts[(i + 1) % pts.length], pts[i]));
  return total;
}

/** Resample a closed polyline to points `spacing` apart along its length. */
function resampleClosed(pts: Vec2[], spacing: number): Vec2[] {
  const total = perimeter(pts);
  const count = Math.max(3, Math.round(total / spacing));
  const step = total / count;
  const out: Vec2[] = [];
  let seg = 0;
  let segStart = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    let a = pts[seg];
    let b = pts[(seg + 1) % pts.length];
    let len = vlen(sub(b, a));
    while (segStart + len < target && seg < pts.length - 1) {
      segStart += len;
      seg++;
      a = pts[seg];
      b = pts[(seg + 1) % pts.length];
      len = vlen(sub(b, a));
    }
    const f = len > 1e-9 ? (target - segStart) / len : 0;
    out.push(add(a, scale(sub(b, a), f)));
  }
  return out;
}

// Proper open-segment crossing test (haberdashery): shared endpoints and
// collinear overlap don't count.
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const orient = (p: Vec2, q: Vec2, r: Vec2): number =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

// Convex hull of disk centres (Andrew's monotone chain), from haberdashery.
function convexHullOfDisks(circles: Circle[]): number[] {
  if (circles.length < 3) return circles.map((_, i) => i);
  const indices = circles
    .map((_, i) => i)
    .sort((a, b) => circles[a].x - circles[b].x || circles[a].y - circles[b].y);
  const cross3 = (o: number, a: number, b: number): number => {
    const oc = circles[o];
    const ac = circles[a];
    const bc = circles[b];
    return (ac.x - oc.x) * (bc.y - oc.y) - (ac.y - oc.y) * (bc.x - oc.x);
  };
  const lower: number[] = [];
  for (const i of indices) {
    while (lower.length >= 2 && cross3(lower[lower.length - 2], lower[lower.length - 1], i) <= 0)
      lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = indices.length - 1; k >= 0; k--) {
    const i = indices[k];
    while (upper.length >= 2 && cross3(upper[upper.length - 2], upper[upper.length - 1], i) <= 0)
      upper.pop();
    upper.push(i);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Role-aware tangent between two circles (haberdashery): 'outside' wraps the
// circle's exterior (convex peg), 'inside' dips round it (concave peg).
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
  const nrm = add(scale(dir, a), scale(right, b));
  return { t1: add(c1, scale(nrm, s1 * c1.r)), t2: add(c2, scale(nrm, s2 * c2.r)) };
}

function intersectSegmentDisk(a: Vec2, b: Vec2, c: Circle): boolean {
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

// Inserts floaters as convex contacts wherever a tangent crosses them (haberdashery).
function expandWithFloaters(contacts: ContactPeg[], floaters: Circle[]): ContactPeg[] {
  if (floaters.length === 0) return contacts;
  const result: ContactPeg[] = [];
  const added = new Set<Circle>();
  for (let i = 0; i < contacts.length; i++) {
    result.push(contacts[i]);
    const a = contacts[i];
    const b = contacts[(i + 1) % contacts.length];
    const { t1, t2 } = getRoleAwareTangent(
      a.circle,
      b.circle,
      a.role === 'convex' ? 'outside' : 'inside',
      b.role === 'convex' ? 'outside' : 'inside',
    );
    const seg = sub(t2, t1);
    const hits = floaters
      .filter((f) => !added.has(f) && intersectSegmentDisk(t1, t2, f))
      .map((f) => ({ t: dot(sub(f, t1), seg) / Math.max(dot(seg, seg), 1e-12), circle: f }))
      .sort((x, y) => x.t - y.t);
    for (const h of hits) {
      result.push({ circle: h.circle, role: 'convex' });
      added.add(h.circle);
    }
  }
  return result;
}

/**
 * haberdashery's band as a dense closed polyline instead of a Path2D: an arc
 * round each contact (clockwise on screen for convex, anticlockwise for
 * concave) and a straight tangent on to the next.
 */
function bandPolyline(contacts: ContactPeg[], floaters: Circle[]): Vec2[] {
  const expanded = expandWithFloaters(contacts, floaters);
  const m = expanded.length;
  const edges = expanded.map((cp, i) => {
    const next = expanded[(i + 1) % m];
    return getRoleAwareTangent(
      cp.circle,
      next.circle,
      cp.role === 'convex' ? 'outside' : 'inside',
      next.role === 'convex' ? 'outside' : 'inside',
    );
  });
  const TAU = Math.PI * 2;
  const mod = (x: number) => ((x % TAU) + TAU) % TAU;
  const pts: Vec2[] = [];
  for (let i = 0; i < m; i++) {
    const { circle: c, role } = expanded[i];
    const arrival = edges[(i - 1 + m) % m].t2;
    const departure = edges[i].t1;
    const a0 = Math.atan2(arrival.y - c.y, arrival.x - c.x);
    const a1 = Math.atan2(departure.y - c.y, departure.x - c.x);
    const sweep = role === 'convex' ? mod(a1 - a0) : -mod(a0 - a1);
    const arcSteps = Math.max(1, Math.ceil((Math.abs(sweep) * c.r) / 2));
    for (let k = 0; k <= arcSteps; k++) {
      const a = a0 + (sweep * k) / arcSteps;
      pts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
    }
    const end = edges[i].t2;
    const lineSteps = Math.max(1, Math.ceil(vlen(sub(end, departure)) / 2));
    for (let k = 1; k < lineSteps; k++) {
      pts.push(add(departure, scale(sub(end, departure), k / lineSteps)));
    }
  }
  return pts;
}
