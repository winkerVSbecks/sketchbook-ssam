import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { formatCss } from 'culori';
import { cuspPalette } from '../../colors/cusphanger';
import type { CuspSwatch } from '../../colors/cusphanger';

// gears/4's meshing train, grown with a common module so every tooth has the
// same pitch, carries haberdashery's band. In a meshing train every pitch line
// moves at the same speed, so a pulley on each axle at a fixed fraction of its
// gear's pitch radius has the same surface speed too: one belt can ride them
// all. Meshing gears turn opposite ways, so the band wraps one parity on the
// outside (convex pegs on the hull) and dents in round the other parity from
// the inside (concave pegs) — exactly the sense a serpentine belt turns them.
// Each gear advances a whole number of teeth per loop, the belt the same
// length of pitch line, so the motion closes.

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
interface Gear {
  x: number;
  y: number;
  r: number;
  teeth: number;
  phase: number;
  dir: 1 | -1;
  depth: number;
}

const config = {
  module: 13,
  minTeeth: 7,
  maxTeeth: 17,
  count: 16,
  attempts: 600,
  pulley: 0.46,
  dentCount: 3,
  strokeWidth: 13,
  bevelLayers: 7,
  bevelStrength: 0.15,
  teethPerLoop: 6,
  dashCount: 9,
};

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = cuspPalette({ ground: 'dark', count: 2 });
  const bg = palette.bg.css;
  const shade = (s: CuspSwatch, dl: number): string =>
    formatCss({ ...s.color, l: Math.min(1, Math.max(0, s.color.l + dl)) });
  const gearFill = palette.tiers.low[0];
  const gearEdge = palette.tiers.mid[0];
  const pulleySwatch = palette.tiers.mid[1] ?? palette.tiers.mid[0];
  const bandSwatch = palette.tiers.high[1] ?? palette.tiers.high[0];

  const m = config.module;
  const pitch = (teeth: number) => (teeth * m) / 2;
  const tip = (g: Gear) => g.r + m * 0.5;
  const pad = width * 0.1;

  // --- grow the meshing train -------------------------------------------------
  const t0 = Random.rangeFloor(config.minTeeth + 3, config.maxTeeth + 1);
  const gears: Gear[] = [
    { x: width / 2, y: height / 2, r: pitch(t0), teeth: t0, phase: 0, dir: 1, depth: 0 },
  ];
  for (let a = 0; a < config.attempts && gears.length < config.count; a++) {
    const parent = Random.pick(gears) as Gear;
    const teeth = Random.rangeFloor(config.minTeeth, config.maxTeeth + 1);
    const r = pitch(teeth);
    const theta = Random.range(0, Math.PI * 2);
    const x = parent.x + Math.cos(theta) * (parent.r + r);
    const y = parent.y + Math.sin(theta) * (parent.r + r);
    const tipR = r + m * 0.5;
    if (x - tipR < pad || x + tipR > width - pad || y - tipR < pad || y + tipR > height - pad)
      continue;
    const clear = gears.every(
      (g) => g === parent || Math.hypot(g.x - x, g.y - y) > tip(g) + tipR + m,
    );
    if (!clear) continue;
    // Phase the child so a gap faces the parent's tooth at the contact point:
    // with u the parent's tooth phase there, the child's is 0.5 − u.
    const pp = (Math.PI * 2) / parent.teeth;
    const pc = (Math.PI * 2) / teeth;
    const u = (((theta - parent.phase) / pp) % 1 + 1) % 1;
    gears.push({
      x,
      y,
      r,
      teeth,
      phase: theta + Math.PI - pc * (0.5 - u),
      dir: parent.dir === 1 ? -1 : 1,
      depth: parent.depth + 1,
    });
  }

  // --- choose the band's pegs by turning sense ---------------------------------
  // Convex pegs must all turn one way; take the parity that owns more of the hull.
  const pulleyOf = (g: Gear): Circle => ({ x: g.x, y: g.y, r: g.r * config.pulley });
  const pickContacts = (sense: 1 | -1) => {
    const outer = gears.filter((g) => g.dir === sense);
    const hull = convexHull(outer).map((i) => outer[i]);
    const inner = gears.filter(
      (g) => g.dir !== sense && pointInPolygon(g, hull) && distToPolygon(g, hull) > g.r * 0.6,
    );
    return { hull, inner };
  };
  const plus = pickContacts(1);
  const minus = pickContacts(-1);
  const sense: 1 | -1 = plus.hull.length >= minus.hull.length ? 1 : -1;
  const { hull, inner } = sense === 1 ? plus : minus;

  const order: ContactPeg[] = hull.map((g) => ({ circle: pulleyOf(g), role: 'convex' }));
  const dents = (Random.shuffle(inner) as Gear[]).slice(0, config.dentCount);
  for (const g of dents) {
    const c = pulleyOf(g);
    let best = 1;
    let bestCost = Infinity;
    for (let i = 0; i < order.length; i++) {
      const a = order[i].circle;
      const b = order[(i + 1) % order.length].circle;
      const cost = dist(a, c) + dist(c, b) - dist(a, b);
      if (cost < bestCost) {
        bestCost = cost;
        best = i + 1;
      }
    }
    order.splice(best, 0, { circle: c, role: 'concave' });
  }
  twoOpt(order);
  const beltGears = new Set<Gear>([...hull, ...dents]);

  const halfCS = config.strokeWidth / 2;
  const band = new Path2D();
  if (order.length >= 2) {
    // The band's centreline rides half a stroke off the pulley face.
    rubberBandPath(
      band,
      order.map((cp) => ({
        role: cp.role,
        circle: { ...cp.circle, r: cp.circle.r + halfCS },
      })),
    );
  }

  // Every gear passes `teethPerLoop` teeth per loop; the pulley line moves
  // config.pulley × that length of pitch line, the same for every axle.
  const travel = config.teethPerLoop * Math.PI * m * config.pulley;
  const dashPeriod = travel / Math.max(1, Math.round(travel / 60));

  const drawGear = (g: Gear, angle: number) => {
    const p = (Math.PI * 2) / g.teeth;
    const rootR = g.r - m * 0.62;
    const tipR = tip(g);
    context.beginPath();
    for (let i = 0; i < g.teeth; i++) {
      const c = angle + i * p;
      const pts: [number, number][] = [
        [c - p * 0.5, rootR],
        [c - p * 0.27, rootR],
        [c - p * 0.15, tipR],
        [c + p * 0.15, tipR],
        [c + p * 0.27, rootR],
      ];
      for (const [a, r] of pts) context.lineTo(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r);
    }
    context.closePath();
    const gr = context.createLinearGradient(g.x - g.r, g.y - g.r, g.x + g.r, g.y + g.r);
    gr.addColorStop(0, shade(gearFill, 0.05));
    gr.addColorStop(1, shade(gearFill, -0.06));
    context.fillStyle = gr;
    context.fill();
    context.strokeStyle = gearEdge.css;
    context.lineWidth = 1.25;
    context.stroke();

    // Spokes turn with the gear so its rotation reads even without the teeth.
    const hubR = g.r * 0.14;
    context.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = angle + (k * Math.PI) / 2 + p / 2;
      context.moveTo(g.x + Math.cos(a) * hubR, g.y + Math.sin(a) * hubR);
      context.lineTo(g.x + Math.cos(a) * rootR * 0.9, g.y + Math.sin(a) * rootR * 0.9);
    }
    context.stroke();
    context.fillStyle = bg;
    context.beginPath();
    context.arc(g.x, g.y, hubR, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    for (const g of gears) {
      drawGear(g, g.phase + g.dir * ((config.teethPerLoop * Math.PI * 2) / g.teeth) * playhead);
    }

    // Pulleys on the belted axles.
    for (const g of beltGears) {
      const c = pulleyOf(g);
      const gr = context.createLinearGradient(c.x - c.r, c.y - c.r, c.x + c.r, c.y + c.r);
      gr.addColorStop(0, shade(pulleySwatch, config.bevelStrength * 0.5));
      gr.addColorStop(1, shade(pulleySwatch, -config.bevelStrength));
      context.fillStyle = gr;
      context.beginPath();
      context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = bg;
      context.beginPath();
      context.arc(c.x, c.y, g.r * 0.14, 0, Math.PI * 2);
      context.fill();
    }

    // The band: haberdashery's nested bevel strokes, dashed so it visibly runs.
    context.lineJoin = 'round';
    context.setLineDash([dashPeriod - 4, 4]);
    context.lineDashOffset = -sense * travel * playhead;
    const n = config.bevelLayers;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      context.lineWidth = mapRange(t, 0, 1, config.strokeWidth, config.strokeWidth * 0.12);
      context.strokeStyle = shade(
        bandSwatch,
        mapRange(t, 0, 1, -config.bevelStrength, config.bevelStrength),
      );
      context.stroke(band);
    }
    context.setLineDash([]);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10000,
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
  if (pts.length < 3) return pts.map((_, i) => i);
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

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

function distToPolygon(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function twoOpt(order: ContactPeg[]): void {
  const m = order.length;
  for (let iter = 0, improved = true; improved && iter < m * m; iter++) {
    improved = false;
    search: for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        const a = order[i].circle;
        const b = order[(i + 1) % m].circle;
        const c = order[j].circle;
        const d = order[(j + 1) % m].circle;
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

// haberdashery's band path: arcs round each peg, tangents between, seam mid-edge.
function rubberBandPath(path: Path2D, pegs: ContactPeg[]): void {
  const n = pegs.length;
  const edges = pegs.map((cp, i) => {
    const next = pegs[(i + 1) % n];
    return tangent(cp.circle, next.circle, cp.role === 'convex', next.role === 'convex');
  });
  const seam = edges[n - 1];
  const mid = { x: (seam.t1.x + seam.t2.x) / 2, y: (seam.t1.y + seam.t2.y) / 2 };
  path.moveTo(mid.x, mid.y);
  path.lineTo(seam.t2.x, seam.t2.y);
  for (let i = 0; i < n; i++) {
    const { circle: c, role } = pegs[i];
    const arrive = edges[(i - 1 + n) % n].t2;
    const depart = edges[i].t1;
    path.arc(
      c.x,
      c.y,
      c.r,
      Math.atan2(arrive.y - c.y, arrive.x - c.x),
      Math.atan2(depart.y - c.y, depart.x - c.x),
      role === 'concave',
    );
    if (i < n - 1) path.lineTo(edges[i].t2.x, edges[i].t2.y);
    else path.lineTo(mid.x, mid.y);
  }
  path.closePath();
}
