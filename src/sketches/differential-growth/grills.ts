/**
 * Window and gate grills drawn from street photographs, as line data for the
 * `khidki` variants. Each grill lives in its own box, `w` × `h` world units
 * (h is 1), and is a list of polylines (bars, arcs sampled finely) plus
 * filled discs — plain geometry, so a sketch can stroke it, or rasterise it
 * into blocks the way ./khidki-field does.
 *
 *   - sunburst — rays from a half-wheel over a rail; below, two framed panels
 *                tied to their corners by diagonals;
 *   - railing  — two stacked panels, each a small box hung on four diagonals;
 *   - scroll   — a square with its diagonals crossed, four petals ending in
 *                curls round a boss, between double stiles;
 *   - gate     — a round-shouldered gate of stiles and stepped, brick-bond
 *                brackets;
 *   - star     — a ring with four kites to the corners and arms to the
 *                frame, over balusters;
 *   - circles  — a band of touching circles between rails, a short top band
 *                and balusters below.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
export type Pt = [number, number];
export type Polyline = Pt[];

export interface Grill {
  name: string;
  /** Box width; height is always 1. */
  w: number;
  h: number;
  /** The frame's outline, closed: what the grill is clipped to. */
  frame: Polyline;
  bars: Polyline[];
  discs: { x: number; y: number; r: number }[];
}

const line = (a: Pt, b: Pt): Polyline => [a, b];

const rect = (x: number, y: number, w: number, h: number): Polyline => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

/** Arc of a circle from angle a0 to a1 (radians, canvas y down), sampled. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): Polyline {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 0.004));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/** A spiral from radius r0 to r1 about (cx, cy), from angle a0 by `sweep`. */
function spiral(cx: number, cy: number, r0: number, r1: number, a0: number, sweep: number): Polyline {
  const n = Math.max(16, Math.ceil(Math.abs(sweep) * 24));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = a0 + sweep * t;
    const r = r0 + (r1 - r0) * t;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

/**
 * A framed panel: an inner rectangle (`rw` × `rh` of the cell) centred in
 * the cell, each corner tied by a diagonal to the cell's corner.
 */
function boxPanel(x: number, y: number, w: number, h: number, rw: number, rh: number): Polyline[] {
  const iw = w * rw;
  const ih = h * rh;
  const ix = x + (w - iw) / 2;
  const iy = y + (h - ih) / 2;
  return [
    rect(ix, iy, iw, ih),
    line([x, y], [ix, iy]),
    line([x + w, y], [ix + iw, iy]),
    line([x, y + h], [ix, iy + ih]),
    line([x + w, y + h], [ix + iw, iy + ih]),
  ];
}

/** From (x, y) along (dx, dy) until the edge of box [x0, x1] × [y0, y1]. */
function toEdge([x, y]: Pt, dx: number, dy: number, x0: number, y0: number, x1: number, y1: number): Pt {
  const ts = [
    dx > 0 ? (x1 - x) / dx : dx < 0 ? (x0 - x) / dx : Infinity,
    dy > 0 ? (y1 - y) / dy : dy < 0 ? (y0 - y) / dy : Infinity,
  ];
  const t = Math.min(...ts);
  return [x + dx * t, y + dy * t];
}

function sunburst(): Grill {
  const w = 0.74;
  const m = 0.49;
  const c: Pt = [w / 2, m];
  const r = 0.08;
  const bars: Polyline[] = [line([0, m], [w, m]), arc(c[0], c[1], r, Math.PI, 2 * Math.PI)];
  for (const deg of [22, 46, 69, 90, 111, 134, 158]) {
    const a = (deg * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), -Math.sin(a)];
    bars.push(line([c[0] + dx * r, c[1] + dy * r], toEdge(c, dx, dy, 0, 0, w, m)));
  }
  bars.push(line([w / 2, m], [w / 2, 1]));
  bars.push(...boxPanel(0, m, w / 2, 1 - m, 0.42, 0.42), ...boxPanel(w / 2, m, w / 2, 1 - m, 0.42, 0.42));
  return { name: 'sunburst', w, h: 1, frame: rect(0, 0, w, 1), bars, discs: [] };
}

function railing(): Grill {
  const w = 0.6;
  return {
    name: 'railing',
    w,
    h: 1,
    frame: rect(0, 0, w, 1),
    bars: [line([0, 0.5], [w, 0.5]), ...boxPanel(0, 0, w, 0.5, 0.3, 0.25), ...boxPanel(0, 0.5, w, 0.5, 0.3, 0.25)],
    discs: [],
  };
}

function scroll(): Grill {
  const w = 1;
  const [sx0, sx1, sy0, sy1] = [0.2, 0.8, 0.18, 0.78];
  const c: Pt = [(sx0 + sx1) / 2, (sy0 + sy1) / 2];
  const bars: Polyline[] = [
    line([0.1, 0], [0.1, 1]),
    line([0.9, 0], [0.9, 1]),
    line([sx0, 0], [sx0, 1]),
    line([sx1, 0], [sx1, 1]),
    line([sx0, sy0], [sx1, sy0]),
    line([sx0, sy1], [sx1, sy1]),
    line([sx0, sy0], [sx1, sy1]),
    line([sx1, sy0], [sx0, sy1]),
  ];
  // Four petals round the boss, each a circle open toward the centre whose
  // two ends curl inward into scrolls.
  const d = 0.17;
  const r = 0.11;
  const rc = 0.045;
  const gap = (50 * Math.PI) / 180;
  for (const [ux, uy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ]) {
    const p: Pt = [c[0] + ux * d, c[1] + uy * d];
    const facing = Math.atan2(-uy, -ux);
    const a0 = facing + gap;
    const a1 = facing + 2 * Math.PI - gap;
    bars.push(arc(p[0], p[1], r, a0, a1));
    // Each curl turns about a point just inside its end, carrying on the
    // arc's own sense at the far end and running back against it at the near.
    for (const [a, sweep] of [
      [a1, 1.4 * Math.PI],
      [a0, -1.4 * Math.PI],
    ]) {
      const q: Pt = [p[0] + Math.cos(a) * (r - rc), p[1] + Math.sin(a) * (r - rc)];
      bars.push(spiral(q[0], q[1], rc, rc * 0.3, a, sweep));
    }
  }
  return { name: 'scroll', w, h: 1, frame: rect(0, 0, w, 1), bars, discs: [{ x: c[0], y: c[1], r: 0.035 }] };
}

function gate(): Grill {
  const w = 0.8;
  // Round-shouldered frame: the top corners turned on a small radius.
  const rr = 0.06;
  const frame: Polyline = [
    [0, 1],
    [0, rr],
    ...arc(rr, rr, rr, Math.PI, 1.5 * Math.PI),
    [w - rr, 0],
    ...arc(w - rr, rr, rr, 1.5 * Math.PI, 2 * Math.PI),
    [w, 1],
    [0, 1],
  ];
  const bars: Polyline[] = [0.1, 0.38, 0.47, 0.73].map((x) => line([x, 0], [x, 1]));
  bars.push(line([0, 0.1], [w, 0.1]), line([0, 0.25], [w, 0.25]));
  // Brick-bond steps: a bracket — a rail with short drops at its ends — in
  // the middle on even rows, and a pair hung from the stiles on odd rows.
  const drop = 0.035;
  const bracket = (x0: number, x1: number, y: number, left: boolean, right: boolean): Polyline => [
    ...(left ? [[x0, y + drop] as Pt] : []),
    [x0, y],
    [x1, y],
    ...(right ? [[x1, y + drop] as Pt] : []),
  ];
  for (let k = 0; k < 9; k++) {
    const y = 0.32 + k * 0.075;
    if (k % 2 === 0) bars.push(bracket(0.16, 0.64, y, true, true));
    else bars.push(bracket(0, 0.29, y, false, true), bracket(0.56, w, y, true, false));
  }
  return { name: 'gate', w, h: 1, frame, bars, discs: [] };
}

function star(): Grill {
  const w = 0.55;
  const m = 0.56;
  const c: Pt = [w / 2, 0.29];
  const r = 0.045;
  const bars: Polyline[] = [
    line([0, m], [w, m]),
    arc(c[0], c[1], r, 0, 2 * Math.PI),
    line([0, c[1]], [c[0] - r, c[1]]),
    line([c[0] + r, c[1]], [w, c[1]]),
    line([c[0], 0], [c[0], c[1] - r]),
  ];
  // A kite from the ring to each corner of the upper panel, widest a little
  // under halfway along.
  for (const tip of [
    [0, 0],
    [w, 0],
    [0, m],
    [w, m],
  ] as Pt[]) {
    const [dx, dy] = [tip[0] - c[0], tip[1] - c[1]];
    const len = Math.hypot(dx, dy);
    const [ux, uy] = [dx / len, dy / len];
    const base: Pt = [c[0] + ux * r, c[1] + uy * r];
    const mid: Pt = [c[0] + ux * len * 0.45, c[1] + uy * len * 0.45];
    const half = 0.055;
    bars.push([base, [mid[0] - uy * half, mid[1] + ux * half], tip, [mid[0] + uy * half, mid[1] - ux * half], base]);
  }
  for (const f of [0.2, 0.4, 0.6, 0.8]) bars.push(line([w * f, m], [w * f, 1]));
  return { name: 'star', w, h: 1, frame: rect(0, 0, w, 1), bars, discs: [] };
}

function circles(): Grill {
  const w = 0.68;
  const [t0, t1, b0, b1] = [0.07, 0.16, 0.54, 0.61];
  const r = (b0 - t1) / 2;
  const cy = (t1 + b0) / 2;
  const bars: Polyline[] = [t0, t1, b0, b1].map((y) => line([0, y], [w, y]));
  bars.push(line([w * 0.36, t0], [w * 0.36, t1]), line([w * 0.61, t0], [w * 0.61, t1]));
  // Touching circles along the band, a bar through every point they touch.
  for (let x = r; x - r < w; x += 2 * r) {
    bars.push(arc(x, cy, r, 0, 2 * Math.PI));
    bars.push(line([x + r, t1], [x + r, b0]));
  }
  const n = 9;
  for (let i = 1; i <= n; i++) bars.push(line([(w * i) / (n + 1), b1], [(w * i) / (n + 1), 1]));
  return { name: 'circles', w, h: 1, frame: rect(0, 0, w, 1), bars, discs: [] };
}

export const GRILLS: Grill[] = [sunburst(), railing(), scroll(), gate(), star(), circles()];
