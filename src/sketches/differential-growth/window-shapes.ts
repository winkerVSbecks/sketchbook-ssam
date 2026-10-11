/**
 * Window openings for the `windows` variant: a square wall of `extent` world
 * units pierced by convex openings, each of which holds one growing curve.
 *
 * Patterns, after the screens elsewhere in the sketchbook:
 *   - frames    — a grid of rectangular windows, each split by mullions into
 *                 panes (the outer frame of ../khidki, repeated);
 *   - triangles — staggered rows of up/down triangles (../jali/mexico);
 *   - diamonds  — the classic jali lattice of squares on their points;
 *   - khidki    — a square grill with every cell cut by a diagonal that
 *                 alternates like a checkerboard (../khidki's lozenges).
 *
 * Bars between openings are `frame` world units thick: every opening is its
 * lattice shape clipped to the wall and inset by half a bar. All openings are
 * convex, so confinement is exact — inside every edge's half-plane or else
 * moved to the nearest point on the inset outline — with no raster in between.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
import Random from 'canvas-sketch-util/random';

import type { GrowthNode } from '../terminal-ui/growth-sim';

export type Pattern = 'frames' | 'triangles' | 'diamonds' | 'khidki';
export const PATTERNS: Pattern[] = ['frames', 'triangles', 'diamonds', 'khidki'];

/** A convex polygon, counter-clockwise in canvas space (y down), `[x, y][]`. */
export type Polygon = [number, number][];

export interface WindowOptions {
  pattern: Pattern;
  /** Side of the square wall, in world units. */
  extent: number;
  /** Lattice cells (or windows) across the wall. */
  divisions: number;
  /** Bar thickness between openings, in world units. */
  frame: number;
}

/** Signed area; positive for the winding `inset` expects. */
export function area(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function centroid(poly: Polygon): GrowthNode {
  let x = 0;
  let y = 0;
  for (const [px, py] of poly) {
    x += px;
    y += py;
  }
  return { x: x / poly.length, y: y / poly.length };
}

const oriented = (poly: Polygon): Polygon => (area(poly) < 0 ? [...poly].reverse() : poly);

/** Sutherland–Hodgman: keep the part of `poly` on the inner side of edge a→b. */
function clipEdge(poly: Polygon, a: [number, number], b: [number, number]): Polygon {
  const side = ([x, y]: [number, number]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** `poly` clipped to the convex `clip` polygon. */
function clipTo(poly: Polygon, clip: Polygon): Polygon {
  let out = oriented(poly);
  const c = oriented(clip);
  for (let i = 0; i < c.length && out.length > 0; i++) out = clipEdge(out, c[i], c[(i + 1) % c.length]);
  return out;
}

/**
 * Shrink a convex polygon by `d`: push every edge inward and intersect each
 * pair of neighbours. Returns an empty polygon once it would turn inside out.
 */
export function inset(poly: Polygon, d: number): Polygon {
  const p = oriented(poly);
  const n = p.length;
  const lines = p.map(([x0, y0], i) => {
    const [x1, y1] = p[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    // Inward normal for the winding `oriented` gives (positive signed area).
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    return { x: x0 + nx * d, y: y0 + ny * d, dx: x1 - x0, dy: y1 - y0 };
  });
  const out: Polygon = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n];
    const b = lines[i];
    const den = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / den;
    out.push([a.x + a.dx * t, a.y + a.dy * t]);
  }
  // An inset that flipped orientation, or lost an edge, has collapsed.
  return out.length === n && area(out) > 0 ? out : [];
}

const rect = (x: number, y: number, w: number, h: number): Polygon => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * Rectangular windows, each split by mullions into 1–3 × 1–3 panes. Windows
 * keep a full bar of wall between them; mullions are half a bar, so the panes
 * of one window still read as one window. Returned at final size.
 */
function frames(e: number, n: number, frame: number): Polygon[] {
  const cell = e / n;
  const mullion = frame / 2;
  const panes: Polygon[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * cell + frame / 2;
      const y = j * cell + frame / 2;
      const w = cell - frame;
      const kx = Random.rangeFloor(1, 4);
      const ky = Random.rangeFloor(1, 4);
      const pw = (w - (kx - 1) * mullion) / kx;
      const ph = (w - (ky - 1) * mullion) / ky;
      if (pw <= 0 || ph <= 0) continue;
      for (let b = 0; b < ky; b++) {
        for (let a = 0; a < kx; a++) {
          panes.push(rect(x + a * (pw + mullion), y + b * (ph + mullion), pw, ph));
        }
      }
    }
  }
  return panes;
}

/** Staggered rows of up and down triangles, as in jali/mexico. */
function triangles(e: number, n: number): Polygon[] {
  const h = e / n;
  const s = (2 * h) / Math.sqrt(3);
  const cols = Math.ceil(e / s) + 1;
  const tris: Polygon[] = [];
  for (let row = 0; row < n; row++) {
    const y0 = row * h;
    const y1 = y0 + h;
    const shift = row % 2 === 0 ? 0 : s / 2;
    for (let col = -1; col <= cols; col++) {
      const x = col * s + shift;
      tris.push([
        [x + s / 2, y0],
        [x + s, y1],
        [x, y1],
      ]);
      // The down triangle fills the gap between this up triangle and the next.
      tris.push([
        [x + s / 2, y0],
        [x + (3 * s) / 2, y0],
        [x + s, y1],
      ]);
    }
  }
  return tris;
}

/** Squares on their points: the classic jali lattice. */
function diamonds(e: number, n: number): Polygon[] {
  const d = e / n;
  const out: Polygon[] = [];
  for (let j = -1; j <= n * 2 + 1; j++) {
    for (let i = -1; i <= n + 1; i++) {
      const cx = i * d + (j % 2 === 0 ? 0 : d / 2);
      const cy = (j * d) / 2;
      out.push([
        [cx, cy - d / 2],
        [cx + d / 2, cy],
        [cx, cy + d / 2],
        [cx - d / 2, cy],
      ]);
    }
  }
  return out;
}

/** A square grill, every cell cut along a diagonal that alternates like khidki's. */
function khidki(e: number, n: number): Polygon[] {
  const s = e / n;
  const out: Polygon[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [x0, y0, x1, y1] = [i * s, j * s, (i + 1) * s, (j + 1) * s];
      if ((i + j) % 2 === 0) {
        out.push([
          [x0, y0],
          [x1, y0],
          [x1, y1],
        ]);
        out.push([
          [x0, y0],
          [x1, y1],
          [x0, y1],
        ]);
      } else {
        out.push([
          [x0, y0],
          [x1, y0],
          [x0, y1],
        ]);
        out.push([
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ]);
      }
    }
  }
  return out;
}

/**
 * The openings of one wall: lattice shapes clipped to the square and inset by
 * half a bar, dropping any too small to hold a curve (`minArea`, world units²).
 */
export function windowOpenings(o: WindowOptions, minArea: number): Polygon[] {
  const { pattern, extent: e, divisions: n, frame } = o;
  const wall = rect(0, 0, e, e);
  const openings =
    pattern === 'frames'
      ? frames(e, n, frame)
      : (pattern === 'triangles' ? triangles(e, n) : pattern === 'diamonds' ? diamonds(e, n) : khidki(e, n)).map(
          (s) => inset(clipTo(s, wall), frame / 2),
        );
  return openings.filter((p) => p.length >= 3 && area(p) >= minArea);
}

/**
 * Keeps nodes `margin` inside a convex opening: a node outside any inset edge
 * moves to the nearest point on the inset outline.
 */
export function createPolygonConfiner(poly: Polygon, margin: number) {
  const inner = inset(poly, margin);
  const shape = inner.length >= 3 ? inner : [centroid(poly)].map((c) => [c.x, c.y] as [number, number]);
  const n = shape.length;
  return (p: GrowthNode): void => {
    if (n >= 3) {
      let outside = false;
      for (let i = 0; i < n && !outside; i++) {
        const [x0, y0] = shape[i];
        const [x1, y1] = shape[(i + 1) % n];
        outside = (x1 - x0) * (p.y - y0) - (y1 - y0) * (p.x - x0) < 0;
      }
      if (!outside) return;
    }
    let best = Infinity;
    let bx = p.x;
    let by = p.y;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = shape[i];
      const [x1, y1] = shape[(i + 1) % n];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - x0) * dx + (p.y - y0) * dy) / len2)) : 0;
      const qx = x0 + dx * t;
      const qy = y0 + dy * t;
      const d = (qx - p.x) ** 2 + (qy - p.y) ** 2;
      if (d < best) {
        best = d;
        bx = qx;
        by = qy;
      }
    }
    p.x = bx;
    p.y = by;
  };
}
