/**
 * The grill and blocks of the `khidki` variant: ../khidki's window grill —
 * vertical and horizontal bars, a lozenge across every cell joining its two
 * circle corners, circles and diamonds alternating on the crossings — laid
 * over the opening of a rectangular frame, and every block the grill leaves
 * open filled with either nalee walks or a differential-growth curve.
 *
 * Proportions follow the reference: in units of the bar pitch `s`, the
 * opening is 5.4s × 7.1s, five vertical bars from 0.7s and seven horizontal
 * bars from 0.5s, lozenges waisted at 0.4/0.6 of the cross diagonal.
 *
 * Blocks are found, not drawn: the opening is rasterised into a fine mask,
 * cells under a bar, lozenge edge, circle or diamond are closed, and each
 * 4-connected run of open cells is one block (region.ts confines growth to
 * it). The grill is drawn over the fills, so the raster's steps never show.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
import Random from 'canvas-sketch-util/random';

import { createGrowth, type Growth } from '../terminal-ui/growth-sim';
import { createConfiner, createMask, naleeWalks, type LatticePoint, type RegionMask } from './region';

/** Bar pitch, in world units. */
export const PITCH = 10;
export const APERTURE_W = 5.4 * PITCH;
export const APERTURE_H = 7.1 * PITCH;
/** Mask resolution, in world units per cell. */
const RES = 0.25;
/** Node budget per world unit² of block at the default spacing. */
const NODES_PER_AREA = 7.5;
const DEFAULT_RADIUS = 0.9;

type Pt = [number, number];
export type Segment = [Pt, Pt];

export interface Grill {
  /** Bars and lozenge edges, as segments. */
  bars: Segment[];
  lozenges: Pt[][];
  circles: Pt[];
  diamonds: Pt[];
  /** Circle radius and diamond half-diagonal, in world units. */
  circleR: number;
  diamondR: number;
}

export interface GrillOptions {
  /** Bar thickness, in world units. */
  bar: number;
  /** Circle and diamond size, as a fraction of the pitch. */
  knot: number;
}

export function makeGrill(o: GrillOptions): Grill {
  const s = PITCH;
  const xs = Array.from({ length: 5 }, (_, i) => 0.7 * s + i * s);
  const ys = Array.from({ length: 7 }, (_, j) => 0.5 * s + j * s);
  const bars: Segment[] = [
    ...xs.map((x): Segment => [
      [x, 0],
      [x, APERTURE_H],
    ]),
    ...ys.map((y): Segment => [
      [0, y],
      [APERTURE_W, y],
    ]),
  ];
  const lozenges: Pt[][] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const [x0, x1, y0, y1] = [xs[i], xs[i + 1], ys[j], ys[j + 1]];
      // Circles sit where i + j is even, so each cell has them on one diagonal.
      const [a, b, c, d]: Pt[] =
        (i + j) % 2 === 0
          ? [
              [x0, y0],
              [x1, y1],
              [x1, y0],
              [x0, y1],
            ]
          : [
              [x1, y0],
              [x0, y1],
              [x1, y1],
              [x0, y0],
            ];
      const lerp = (t: number): Pt => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t];
      lozenges.push([a, lerp(0.4), b, lerp(0.6)]);
      for (let k = 0; k < 4; k++) bars.push([lozenges[lozenges.length - 1][k], lozenges[lozenges.length - 1][(k + 1) % 4]]);
    }
  }
  const circles: Pt[] = [];
  const diamonds: Pt[] = [];
  ys.forEach((y, j) => xs.forEach((x, i) => ((i + j) % 2 === 0 ? circles : diamonds).push([x, y])));
  return { bars, lozenges, circles, diamonds, circleR: o.knot * 0.17 * s, diamondR: o.knot * 0.19 * s };
}

function segDist([px, py]: Pt, [[ax, ay], [bx, by]]: Segment): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

export type BlockKind = 'growth' | 'nalee';

export interface Block {
  id: number;
  kind: BlockKind;
  /** Open area, in world units². */
  area: number;
  growth?: Growth;
  walks?: LatticePoint[][];
}

export interface KhidkiField {
  grill: Grill;
  mask: RegionMask;
  blocks: Block[];
  /** Walk lattice pitch, in world units. */
  walkPitch: number;
  step(): void;
}

export interface FieldOptions extends GrillOptions {
  /** Chance a block is grown rather than walked. */
  growthShare: number;
  /** Repulsion radius: the curve's spacing, in world units. */
  radius: number;
  /** Walk lattice pitch, in world units. */
  walkPitch: number;
  /** Longest walk, in lattice steps. */
  walkLength: number;
}

export function createKhidkiField(o: FieldOptions): KhidkiField {
  const grill = makeGrill(o);
  const cols = Math.ceil(APERTURE_W / RES);
  const rows = Math.ceil(APERTURE_H / RES);
  const mask = createMask(cols, rows, RES);

  // Close every cell under the grill.
  const open = new Uint8Array(cols * rows);
  const half = o.bar / 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p: Pt = [(x + 0.5) * RES, (y + 0.5) * RES];
      const shut =
        grill.bars.some((seg) => segDist(p, seg) < half) ||
        grill.circles.some(([cx, cy]) => Math.hypot(p[0] - cx, p[1] - cy) < grill.circleR) ||
        grill.diamonds.some(([cx, cy]) => Math.abs(p[0] - cx) + Math.abs(p[1] - cy) < grill.diamondR);
      open[y * cols + x] = shut ? 0 : 1;
    }
  }

  // Each 4-connected run of open cells is a block; slivers too small to hold
  // a loop of curve or a walk stay closed.
  const minCells = Math.ceil((2 * o.radius) ** 2 / (RES * RES));
  const blocks: Block[] = [];
  const seen = new Uint8Array(cols * rows);
  for (let start = 0; start < open.length; start++) {
    if (!open[start] || seen[start]) continue;
    const cells: number[] = [start];
    seen[start] = 1;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (open[n] && !seen[n]) {
          seen[n] = 1;
          cells.push(n);
        }
      }
    }
    if (cells.length < minCells) continue;
    const id = blocks.length;
    for (const c of cells) mask.ids[c] = id;
    blocks.push({
      id,
      kind: Random.chance(o.growthShare) ? 'growth' : 'nalee',
      area: cells.length * RES * RES,
    });
  }

  // Depth of every cell: steps to the nearest closed cell or the edge, so a
  // curve can start where its block is widest and walks keep off the bars.
  const depth = new Int32Array(cols * rows).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < depth.length; i++) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    if (mask.ids[i] < 0 || x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
      depth[i] = 0;
      queue.push(i);
    }
  }
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k];
    const cx = c % cols;
    const cy = Math.floor(c / cols);
    for (const n of [c + 1, c - 1, c + cols, c - cols]) {
      if (n < 0 || n >= depth.length || depth[n] >= 0) continue;
      if (Math.abs((n % cols) - cx) + Math.abs(Math.floor(n / cols) - cy) !== 1) continue;
      depth[n] = depth[c] + 1;
      queue.push(n);
    }
  }
  const deepest = new Map<number, number>();
  mask.ids.forEach((id, i) => {
    if (id < 0) return;
    const best = deepest.get(id);
    if (best === undefined || depth[i] > depth[best]) deepest.set(id, i);
  });

  const confine = createConfiner(mask, o.radius * 0.5);
  const density = NODES_PER_AREA * (DEFAULT_RADIUS / o.radius);
  const lc = Math.floor(APERTURE_W / o.walkPitch);
  const lr = Math.floor(APERTURE_H / o.walkPitch);
  // Walk nodes keep a radius clear of the grill, like the curves' margin.
  const clear = Math.ceil(o.radius / RES);
  const nodeCell = (u: number, v: number) =>
    Math.floor(((v + 0.5) * o.walkPitch) / RES) * cols + Math.floor(((u + 0.5) * o.walkPitch) / RES);

  for (const block of blocks) {
    if (block.kind === 'growth') {
      const c = deepest.get(block.id)!;
      const r = Math.max(RES, Math.min(1, depth[c] * RES * 0.5));
      block.growth = createGrowth({
        seed: Random.rangeFloor(1, 0xffffff),
        origin: { x: ((c % cols) + 0.5) * RES, y: (Math.floor(c / cols) + 0.5) * RES },
        radius: r,
        repulsionRadius: o.radius,
        maxNodes: Math.max(32, Math.round(block.area * density)),
      });
    } else {
      block.walks = naleeWalks(
        lc,
        lr,
        (u, v) => {
          const n = nodeCell(u, v);
          return mask.ids[n] === block.id && depth[n] >= clear;
        },
        () => Random.rangeFloor(2, Math.max(2, o.walkLength) + 1),
      );
    }
  }

  return {
    grill,
    mask,
    blocks,
    walkPitch: o.walkPitch,
    step() {
      for (const b of blocks) {
        if (!b.growth) continue;
        b.growth.step();
        for (const p of b.growth.state.nodes) confine(b.id, p);
      }
    },
  };
}
