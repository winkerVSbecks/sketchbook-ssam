/**
 * Shared machinery for the differential-growth variants: nalee-style lattice
 * paths, thick bands rasterised from them into a labelled cell mask, and the
 * confinement rule that keeps a growing curve inside its own band.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
import Random from 'canvas-sketch-util/random';

import type { GrowthNode } from '../terminal-ui/growth-sim';

/** A lattice node, `[x, y]`. */
export type LatticePoint = [number, number];
/** A cell side in world units, `[x0, y0, x1, y1]`. */
export type Edge = [number, number, number, number];

/**
 * A grid of square cells, each labelled with the region it belongs to
 * (`-1` = empty). One cell is `cell` world units on a side.
 */
export interface RegionMask {
  cols: number;
  rows: number;
  cell: number;
  ids: Int32Array;
}

export function createMask(cols: number, rows: number, cell: number): RegionMask {
  return { cols, rows, cell, ids: new Int32Array(cols * rows).fill(-1) };
}

/** Region id at cell `(cx, cy)`; `-1` when empty or off the grid. */
export function idAt(mask: RegionMask, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= mask.cols || cy >= mask.rows) return -1;
  return mask.ids[cy * mask.cols + cx];
}

function fillRect(mask: RegionMask, x0: number, y0: number, x1: number, y1: number, id: number) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x >= 0 && y >= 0 && x < mask.cols && y < mask.rows) mask.ids[y * mask.cols + x] = id;
    }
  }
}

const STEPS: LatticePoint[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * nalee walks: walkers start on random free nodes and hold a preferred
 * direction, bouncing to its opposite at a wall and otherwise stepping to any
 * free neighbour, until they are boxed in. New walkers spawn until every
 * allowed node is taken, so the lattice is tiled by non-crossing paths.
 * `maxLength` (drawn per walker) retires a walker early, for more, shorter walks.
 */
export function naleeWalks(
  cols: number,
  rows: number,
  allowed: (x: number, y: number) => boolean = () => true,
  maxLength: () => number = () => Infinity,
): LatticePoint[][] {
  const taken = new Uint8Array(cols * rows);
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && !taken[y * cols + x] && allowed(x, y);

  const walks: LatticePoint[][] = [];
  for (;;) {
    const open: LatticePoint[] = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (free(x, y)) open.push([x, y]);
    if (open.length === 0) return walks;

    let [x, y] = Random.pick(open);
    taken[y * cols + x] = 1;
    const walk: LatticePoint[] = [[x, y]];
    // 0/1 = horizontal pair, 2/3 = vertical pair; the walker bounces within it.
    let pref = Random.pick([0, 1, 2, 3]);
    const limit = maxLength();
    while (walk.length < limit) {
      const options = STEPS.map(([dx, dy]) => [x + dx, y + dy] as LatticePoint);
      let next: LatticePoint | undefined = options[pref];
      if (!free(...next)) {
        pref ^= 1;
        next = options[pref];
      }
      if (!free(...next)) {
        const rest = options.filter((o) => free(...o));
        next = rest.length > 0 ? Random.pick(rest) : undefined;
      }
      if (!next) break;
      [x, y] = next;
      taken[y * cols + x] = 1;
      walk.push(next);
    }
    walks.push(walk);
  }
}

/**
 * One line through every node of a `cols`×`rows` lattice: a random
 * Hamiltonian path by backbite moves (Mansfield 2006). Start from a
 * boustrophedon; repeatedly join an end to one of its lattice neighbours and
 * reverse the loop that closes, which keeps the path whole while it forgets
 * the rows it started from.
 */
export function hamiltonianPath(cols: number, rows: number, moves = cols * rows * 60) {
  let path: LatticePoint[] = [];
  for (let y = 0; y < rows; y++) {
    for (let i = 0; i < cols; i++) path.push([y % 2 === 0 ? i : cols - 1 - i, y]);
  }
  const n = path.length;
  const index = new Int32Array(cols * rows);
  const reindex = (from: number) => {
    for (let i = from; i < n; i++) index[path[i][1] * cols + path[i][0]] = i;
  };
  reindex(0);

  for (let m = 0; m < moves; m++) {
    if (Random.chance(0.5)) {
      path = path.reverse();
      reindex(0);
    }
    const [ex, ey] = path[n - 1];
    const [dx, dy] = Random.pick(STEPS);
    const nx = ex + dx;
    const ny = ey + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const k = index[ny * cols + nx];
    if (k === n - 2) continue;
    const tail = path.slice(k + 1).reverse();
    path.splice(k + 1, tail.length, ...tail);
    reindex(k + 1);
  }
  return path;
}

/**
 * A lattice path as a thick band. Node `(x, y)` owns the `band`×`band` block
 * of cells at `(x·pitch, y·pitch)`; each step of the path also fills the
 * `pitch - band` gap between its two blocks. Gaps no step crosses stay empty,
 * so neighbouring bands — and a band running beside itself — stay apart.
 */
export function stampPath(
  mask: RegionMask,
  path: LatticePoint[],
  id: number,
  pitch: number,
  band: number,
): void {
  for (const [x, y] of path) fillRect(mask, x * pitch, y * pitch, x * pitch + band, y * pitch + band, id);
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const x0 = Math.min(ax, bx) * pitch;
    const y0 = Math.min(ay, by) * pitch;
    if (ay === by) fillRect(mask, x0 + band, y0, x0 + pitch, y0 + band, id);
    else fillRect(mask, x0, y0 + band, x0 + band, y0 + pitch, id);
  }
}

/** World-space centreline of a band stamped by `stampPath`. */
export function bandCentreline(
  path: LatticePoint[],
  pitch: number,
  band: number,
  cell: number,
): GrowthNode[] {
  return path.map(([x, y]) => ({ x: (x * pitch + band / 2) * cell, y: (y * pitch + band / 2) * cell }));
}

/**
 * A thin closed loop hugging `line`: out along one side at `offset`, back
 * along the other. Seeding the growth this way lets the whole band buckle at
 * once instead of waiting for one ring to crawl down a long corridor.
 */
export function seedLoop(line: GrowthNode[], offset: number): GrowthNode[] {
  if (line.length === 1) {
    const [c] = line;
    return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return { x: c.x + Math.cos(a) * offset * 2, y: c.y + Math.sin(a) * offset * 2 };
    });
  }
  const side = (s: number) =>
    line.map((p, i) => {
      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: p.x - ((b.y - a.y) / len) * offset * s, y: p.y + ((b.x - a.x) / len) * offset * s };
    });
  return [...side(1), ...side(-1).reverse()];
}

/**
 * Keeps nodes inside their region, at least `margin` from any side that faces
 * a different region. A node that has strayed is moved to the nearest point
 * inside; the search looks at nearby cells first and only falls back to the
 * whole region when nothing of its own is close.
 */
export function createConfiner(mask: RegionMask, margin: number) {
  const { cols, cell } = mask;
  const cellsOf = new Map<number, number[]>();
  mask.ids.forEach((id, i) => {
    if (id < 0) return;
    const list = cellsOf.get(id) ?? [];
    list.push(i);
    cellsOf.set(id, list);
  });

  /** Nearest point to `p` in cell `(cx, cy)`, shrunk along foreign sides. */
  const nearestIn = (id: number, cx: number, cy: number, p: GrowthNode): [number, number, number] => {
    const x0 = cx * cell + (idAt(mask, cx - 1, cy) === id ? 0 : margin);
    const x1 = (cx + 1) * cell - (idAt(mask, cx + 1, cy) === id ? 0 : margin);
    const y0 = cy * cell + (idAt(mask, cx, cy - 1) === id ? 0 : margin);
    const y1 = (cy + 1) * cell - (idAt(mask, cx, cy + 1) === id ? 0 : margin);
    const qx = Math.min(x1, Math.max(x0, p.x));
    const qy = Math.min(y1, Math.max(y0, p.y));
    return [qx, qy, (qx - p.x) ** 2 + (qy - p.y) ** 2];
  };

  const inside = (id: number, p: GrowthNode): boolean => {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    if (idAt(mask, cx, cy) !== id) return false;
    const lx = p.x - cx * cell;
    const ly = p.y - cy * cell;
    return !(
      (lx < margin && idAt(mask, cx - 1, cy) !== id) ||
      (lx > cell - margin && idAt(mask, cx + 1, cy) !== id) ||
      (ly < margin && idAt(mask, cx, cy - 1) !== id) ||
      (ly > cell - margin && idAt(mask, cx, cy + 1) !== id)
    );
  };

  return (id: number, p: GrowthNode): void => {
    if (inside(id, p)) return;
    const pcx = Math.floor(p.x / cell);
    const pcy = Math.floor(p.y / cell);
    let best = Infinity;
    let bx = p.x;
    let by = p.y;
    const consider = (cx: number, cy: number) => {
      if (idAt(mask, cx, cy) !== id) return;
      const [qx, qy, d] = nearestIn(id, cx, cy, p);
      if (d < best) {
        best = d;
        bx = qx;
        by = qy;
      }
    };
    for (let cy = pcy - 2; cy <= pcy + 2; cy++) for (let cx = pcx - 2; cx <= pcx + 2; cx++) consider(cx, cy);
    if (best === Infinity) {
      for (const i of cellsOf.get(id) ?? []) consider(i % cols, Math.floor(i / cols));
    }
    p.x = bx;
    p.y = by;
  };
}

/** Area of each region, in world units², keyed by id. */
export function regionAreas(mask: RegionMask): Map<number, number> {
  const areas = new Map<number, number>();
  for (const id of mask.ids) if (id >= 0) areas.set(id, (areas.get(id) ?? 0) + mask.cell ** 2);
  return areas;
}

/** Outline of every region: each cell side whose neighbour has another id. */
export function outline(mask: RegionMask): Edge[] {
  const { cols, rows, cell } = mask;
  const edges: Edge[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const id = idAt(mask, x, y);
      if (id < 0) continue;
      const [l, t, r, b] = [x * cell, y * cell, (x + 1) * cell, (y + 1) * cell];
      if (idAt(mask, x, y - 1) !== id) edges.push([l, t, r, t]);
      if (idAt(mask, x, y + 1) !== id) edges.push([l, b, r, b]);
      if (idAt(mask, x - 1, y) !== id) edges.push([l, t, l, b]);
      if (idAt(mask, x + 1, y) !== id) edges.push([r, t, r, b]);
    }
  }
  return edges;
}

/** An axis-aligned rectangle in world units, `[x, y, w, h]`. */
export type Rect = [number, number, number, number];

/**
 * Each region as rectangles, one per horizontal run of its cells, keyed by
 * id. Filled together in one path they give the region's area without the
 * hairline seams separate per-cell fills leave between neighbours.
 */
export function regionRects(mask: RegionMask): Map<number, Rect[]> {
  const { cols, rows, cell } = mask;
  const rects = new Map<number, Rect[]>();
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      const id = idAt(mask, x, y);
      let end = x + 1;
      while (end < cols && idAt(mask, end, y) === id) end++;
      if (id >= 0) {
        const list = rects.get(id) ?? [];
        list.push([x * cell, y * cell, (end - x) * cell, cell]);
        rects.set(id, list);
      }
      x = end;
    }
  }
  return rects;
}
