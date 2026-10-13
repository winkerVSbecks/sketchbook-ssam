/**
 * The grill and blocks of the `khidki` variant: ../khidki's window grill —
 * vertical and horizontal bars, a lozenge across every cell joining its two
 * circle corners, circles and diamonds alternating on the crossings — laid
 * over the opening of a rectangular frame, and every block the grill leaves
 * open filled with either nalee walks or a differential-growth curve: whole
 * lozenge stars grown and the rest walked, or the two gathered into noise
 * patches.
 *
 * Proportions follow the reference: in units of the bar pitch `s`, the
 * opening is 5.4s × 7.1s, five vertical bars from 0.7s and seven horizontal
 * bars from 0.5s, lozenges waisted at 0.4/0.6 of the cross diagonal.
 *
 * Blocks are found, not drawn: the opening is rasterised into a fine mask,
 * cells under a bar, lozenge edge or circle are closed (diamonds close
 * nothing and sit on top of the fills), and each 4-connected run of open
 * cells is one block (region.ts confines growth to it). The grill is drawn
 * over the fills, so the raster's steps never show.
 *
 * The same filling takes any grill from ./grills as a GrillShape: its bars
 * and frame are stamped into the mask the same way and its blocks filled in
 * noise patches.
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

/**
 * Any grill as the field needs it: a `w` × `h` box in world units, bars as
 * polylines, discs that close the cells under them, and optionally the
 * frame's outline — cells outside it are closed and the frame itself is a
 * bar `frameBar` thick.
 */
export interface GrillShape {
  w: number;
  h: number;
  bars: Pt[][];
  closers: { x: number; y: number; r: number }[];
  frame?: Pt[];
  frameBar?: number;
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
/** How blocks are assigned a kind: whole lozenge stars, or noise patches. */
/**
 * How blocks are assigned a kind: whole lozenge stars, noise patches, or
 * `alternate` — neighbours across a bar take opposite kinds wherever the
 * leading allows, so every line marks a change of texture.
 */
export type FillPattern = 'stars' | 'patches' | 'alternate';
/** Which stars of the chosen set are grown. */
export type StarPick = 'all' | 'checker' | 'random';

export interface Block {
  id: number;
  kind: BlockKind;
  /** Open area, in world units². */
  area: number;
  growth?: Growth;
  walks?: LatticePoint[][];
}

export interface KhidkiField {
  /** The khidki grill, when the field was built on it (not on a GrillShape). */
  grill?: Grill;
  /** The box the field fills, in world units. */
  w: number;
  h: number;
  mask: RegionMask;
  blocks: Block[];
  /** Walk lattice pitch, in world units. */
  walkPitch: number;
  step(): void;
}

export interface FieldOptions extends GrillOptions {
  pattern: FillPattern;
  /** Stars: centre on circles at odd or even grill positions. */
  starSet: 'odd' | 'even';
  starPick: StarPick;
  /** Patches: share of blocks grown rather than walked. */
  growthShare: number;
  /** Patches: size of the patches blocks of one kind gather into, in bar pitches. */
  groupSize: number;
  /** Repulsion radius: the curve's spacing, in world units. */
  radius: number;
  /** Walk lattice pitch, in world units. */
  walkPitch: number;
  /** Longest walk, in lattice steps. */
  walkLength: number;
  /** Alternate: a block must be this many curve spacings deep to be grown. */
  minGrowth?: number;
  /** Alternate: a fixed kind for blocks centred at (x, y), or undefined to alternate. */
  bias?: (x: number, y: number) => BlockKind | undefined;
  /** Alternate: flip one block, chosen by the seed, against its rule. */
  exception?: boolean;
  /** Walk every block, growth-kind ones too: the kinds still alternate, as colours. */
  walksOnly?: boolean;
}

/** Even-odd point-in-polygon. */
function inside([px, py]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Fill every block of a grill. Without `shape` the grill is khidki's own
 * (bars, lozenges, circles and diamonds on the `PITCH` lattice, stars as a
 * pattern); with one, any grill from ./grills, filled in noise patches.
 */
export function createKhidkiField(o: FieldOptions, shape?: GrillShape): KhidkiField {
  const grill = shape ? undefined : makeGrill(o);
  const g: GrillShape = shape ?? {
    w: APERTURE_W,
    h: APERTURE_H,
    bars: grill!.bars,
    closers: grill!.circles.map(([x, y]) => ({ x, y, r: grill!.circleR })),
  };
  const cols = Math.ceil(g.w / RES);
  const rows = Math.ceil(g.h / RES);
  const mask = createMask(cols, rows, RES);

  // Close every cell outside the frame, then every cell under a bar or a
  // closing disc. Bars are stamped segment by segment over their own bounds
  // only, so grills of finely sampled arcs stay quick. Khidki's diamonds
  // close nothing: the fills run on underneath and they sit on top.
  const open = new Uint8Array(cols * rows).fill(1);
  const centre = (x: number, y: number): Pt => [(x + 0.5) * RES, (y + 0.5) * RES];
  if (g.frame) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) if (!inside(centre(x, y), g.frame)) open[y * cols + x] = 0;
    }
  }
  const shut = (x0: number, y0: number, x1: number, y1: number, test: (p: Pt) => boolean) => {
    const [cx0, cy0] = [Math.max(0, Math.floor(x0 / RES)), Math.max(0, Math.floor(y0 / RES))];
    const [cx1, cy1] = [Math.min(cols - 1, Math.ceil(x1 / RES)), Math.min(rows - 1, Math.ceil(y1 / RES))];
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (test(centre(x, y))) open[y * cols + x] = 0;
  };
  const stamp = (pts: Pt[], half: number) => {
    for (let i = 1; i < pts.length; i++) {
      const seg: Segment = [pts[i - 1], pts[i]];
      const [[ax, ay], [bx, by]] = seg;
      shut(Math.min(ax, bx) - half, Math.min(ay, by) - half, Math.max(ax, bx) + half, Math.max(ay, by) + half, (p) =>
        segDist(p, seg) < half,
      );
    }
  };
  for (const bar of g.bars) stamp(bar, o.bar / 2);
  if (g.frame) stamp(g.frame, (g.frameBar ?? o.bar) / 2);
  for (const d of g.closers) {
    shut(d.x - d.r, d.y - d.r, d.x + d.r, d.y + d.r, ([px, py]) => Math.hypot(px - d.x, py - d.y) < d.r);
  }

  // Each 4-connected run of open cells is a block; slivers too small to hold
  // a loop of curve or a walk stay closed.
  const minCells = Math.ceil((2 * o.radius) ** 2 / (RES * RES));
  const steps = (c: number): number[] => {
    const cx = c % cols;
    const out: number[] = [];
    if (cx + 1 < cols) out.push(c + 1);
    if (cx > 0) out.push(c - 1);
    if (c + cols < cols * rows) out.push(c + cols);
    if (c >= cols) out.push(c - cols);
    return out;
  };
  /** Label the 4-connected components of `inside`, starting at `next`. */
  const components = (inside: (c: number) => boolean, label: Int32Array, next = 0): number => {
    for (let start = 0; start < label.length; start++) {
      if (!inside(start) || label[start] >= 0) continue;
      label[start] = next;
      const queue = [start];
      for (let k = 0; k < queue.length; k++) {
        for (const n of steps(queue[k])) {
          if (inside(n) && label[n] < 0) {
            label[n] = next;
            queue.push(n);
          }
        }
      }
      next++;
    }
    return next;
  };
  const label = new Int32Array(cols * rows).fill(-1);
  if (shape) {
    // A street grill's open runs can join through narrow necks — a petal
    // opening into the triangle beside it — and one curve can't fill both
    // through the gap. Split at necks: the parts at least a curve wide (the
    // cells `k` deep) are each a block, and the thin rim round them is shared
    // out to the nearest part.
    const k = Math.ceil(o.radius / RES);
    const d0 = new Int32Array(cols * rows).fill(-1);
    const queue: number[] = [];
    for (let c = 0; c < d0.length; c++) {
      if (!open[c]) {
        d0[c] = 0;
        queue.push(c);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      for (const n of steps(queue[q])) {
        if (d0[n] < 0) {
          d0[n] = d0[queue[q]] + 1;
          queue.push(n);
        }
      }
    }
    const parts = components((c) => open[c] === 1 && d0[c] >= k, label);
    const grow: number[] = [];
    for (let c = 0; c < label.length; c++) if (label[c] >= 0) grow.push(c);
    for (let q = 0; q < grow.length; q++) {
      for (const n of steps(grow[q])) {
        if (open[n] && label[n] < 0) {
          label[n] = label[grow[q]];
          grow.push(n);
        }
      }
    }
    // Runs with no part that wide keep their own label.
    components((c) => open[c] === 1, label, parts);
  } else {
    components((c) => open[c] === 1, label);
  }

  const byLabel = new Map<number, number[]>();
  label.forEach((l, c) => {
    if (l < 0) return;
    const list = byLabel.get(l) ?? [];
    list.push(c);
    byLabel.set(l, list);
  });
  const blocks: Block[] = [];
  const centres: Pt[] = [];
  for (const cells of byLabel.values()) {
    if (cells.length < minCells) continue;
    const id = blocks.length;
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      mask.ids[c] = id;
      sx += c % cols;
      sy += Math.floor(c / cols);
    }
    centres.push([(sx / cells.length + 0.5) * RES, (sy / cells.length + 0.5) * RES]);
    blocks.push({ id, kind: 'nalee', area: cells.length * RES * RES });
  }

  if (o.pattern === 'stars' && !shape) assignStars(blocks, centres, o.starSet, o.starPick);
  else if (o.pattern === 'patches' || o.pattern === 'stars') assignPatches(blocks, centres, o.growthShare, o.groupSize);

  // Depth of every cell: steps to the nearest closed cell, so a curve can
  // start where its block is widest and walks keep off the bars. The field's
  // own edge is not a wall — it runs under the window frame — so walks may
  // run right up to it.
  const depth = new Int32Array(cols * rows).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < depth.length; i++) {
    const x = i % cols;
    const y = Math.floor(i / cols);
    if (mask.ids[i] < 0 || (shape?.frame && (x === 0 || y === 0 || x === cols - 1 || y === rows - 1))) {
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

  if (o.pattern === 'alternate') {
    // A curve needs room to settle into one even texture: blocks nowhere
    // `minGrowth` spacings deep are walked, whatever their neighbours.
    const room = Math.ceil(((o.minGrowth ?? 0) * o.radius) / RES);
    const thin = (b: Block) => depth[deepest.get(b.id)!] < room;
    const fixed = (b: Block) => o.bias?.(centres[b.id][0], centres[b.id][1]);
    assignAlternate(blocks, neighbours(mask.ids, cols, rows, Math.ceil(o.bar / RES) + 2), thin, fixed);
    if (o.exception) {
      // One exception per work: a block that could grow, chosen by the seed
      // among the larger half, takes the other texture.
      const able = blocks.filter((b) => !thin(b)).sort((p, q) => q.area - p.area);
      const pick = able.length ? able[Random.rangeFloor(0, Math.ceil(able.length / 2))] : undefined;
      if (pick) pick.kind = pick.kind === 'growth' ? 'nalee' : 'growth';
    }
  }

  const confine = createConfiner(mask, o.radius * 0.5);
  const density = NODES_PER_AREA * (DEFAULT_RADIUS / o.radius);
  // The lattice covers the whole field, its last column and row included.
  const lc = Math.ceil(g.w / o.walkPitch);
  const lr = Math.ceil(g.h / o.walkPitch);
  // Walk nodes keep the same margin off the grill as the curves do.
  const clear = Math.ceil((o.radius * 0.5) / RES);
  const nodeCell = (u: number, v: number) => {
    const x = Math.floor(((u + 0.5) * o.walkPitch) / RES);
    const y = Math.floor(((v + 0.5) * o.walkPitch) / RES);
    return x < cols && y < rows ? y * cols + x : -1;
  };

  for (const block of blocks) {
    if (block.kind === 'growth' && !o.walksOnly) {
      const c = deepest.get(block.id)!;
      const r = Math.max(RES, Math.min(1, depth[c] * RES * 0.5));
      block.growth = createGrowth({
        seed: Random.rangeFloor(1, 0xffffff),
        origin: { x: ((c % cols) + 0.5) * RES, y: (Math.floor(c / cols) + 0.5) * RES },
        radius: r,
        repulsionRadius: o.radius,
        maxNodes: Math.max(32, Math.round(block.area * density)),
      });
      // Street grills' blocks are big and long: a point would take too long
      // to reach their ends, so the curve starts as the block's own outline,
      // traced a little inside its walls, and buckles inward from there.
      // khidki's own small blocks keep the branching look of a point seed.
      if (shape) {
        const loop = contourLoop(mask.ids, depth, cols, rows, block.id, Math.ceil((o.radius * 0.8) / RES));
        if (loop.length >= 8 && loop.length / 0.35 < block.growth.params.maxNodes) block.growth.state.nodes = loop;
      }
    } else {
      block.walks = naleeWalks(
        lc,
        lr,
        (u, v) => {
          const n = nodeCell(u, v);
          return n >= 0 && mask.ids[n] === block.id && depth[n] >= clear;
        },
        () => Random.rangeFloor(2, Math.max(2, o.walkLength) + 1),
      );
    }
  }

  return {
    grill,
    w: g.w,
    h: g.h,
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

/**
 * The outline of block `id` eroded to cells at least `k` deep, as a closed
 * loop in world units: boundary edges of that region run clockwise round
 * each cell (internal ones cancel), are chained end to start, and the
 * longest chain is kept. Every fourth vertex is enough — the growth
 * resamples it. Empty when the block is nowhere `k` deep.
 */
function contourLoop(
  ids: Int32Array,
  depth: Int32Array,
  cols: number,
  rows: number,
  id: number,
  k: number,
): { x: number; y: number }[] {
  const inR = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && ids[y * cols + x] === id && depth[y * cols + x] >= k;
  const next = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (cols + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const a = key(x0, y0);
    const list = next.get(a) ?? [];
    list.push(key(x1, y1));
    next.set(a, list);
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!inR(x, y)) continue;
      if (!inR(x, y - 1)) add(x, y, x + 1, y);
      if (!inR(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inR(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inR(x - 1, y)) add(x, y + 1, x, y);
    }
  }
  let best: number[] = [];
  while (next.size > 0) {
    const [start] = next.keys();
    const chain: number[] = [start];
    let at = start;
    for (;;) {
      const list = next.get(at);
      if (!list || list.length === 0) break;
      const to = list.pop()!;
      if (list.length === 0) next.delete(at);
      if (to === start) break;
      chain.push(to);
      at = to;
    }
    if (chain.length > best.length) best = chain;
  }
  return best
    .filter((_, i) => i % 4 === 0)
    .map((v) => ({ x: (v % (cols + 1)) * RES, y: Math.floor(v / (cols + 1)) * RES }));
}

/**
 * Whole lozenge stars grown, the rest walked. Every cell's lozenge runs from
 * one circle corner to the other, so the 2×2 cells round a circle hold its
 * four lozenges and the darts between them: that square is its star. Squares
 * round circles at every other grill position (odd or even) tile the grill
 * without overlap; `pick` chooses which of those stars grow. Blocks outside
 * the bars' span — the strips along the frame — are always walked.
 */
function assignStars(blocks: Block[], centres: Pt[], set: 'odd' | 'even', pick: StarPick): void {
  const p = set === 'odd' ? 1 : 0;
  const chosen = new Map<string, boolean>();
  const isChosen = (ci: number, cj: number) => {
    const key = `${ci},${cj}`;
    if (!chosen.has(key)) {
      const a = (ci - p) / 2;
      const b = (cj - p) / 2;
      chosen.set(key, pick === 'all' ? true : pick === 'checker' ? (a + b) % 2 === 0 : Random.chance(0.5));
    }
    return chosen.get(key)!;
  };
  for (const block of blocks) {
    const [x, y] = centres[block.id];
    // Grill coordinates: bar i at x = 0.7s + i·s, bar j at y = 0.5s + j·s.
    const gx = (x - 0.7 * PITCH) / PITCH;
    const gy = (y - 0.5 * PITCH) / PITCH;
    const inside = gx > 0 && gx < 4 && gy > 0 && gy < 6;
    const ci = Math.round((gx - p) / 2) * 2 + p;
    const cj = Math.round((gy - p) / 2) * 2 + p;
    block.kind = inside && isChosen(ci, cj) ? 'growth' : 'nalee';
  }
}

/**
 * Patches, not a coin toss per block: sample smooth noise at every block's
 * centre and grow the lowest `share` of them, so neighbours mostly share a
 * fill and the share stays exact.
 */
function assignPatches(blocks: Block[], centres: Pt[], share: number, size: number): void {
  const freq = 1 / (Math.max(0.1, size) * PITCH);
  const shift = Random.range(0, 1000);
  const ranked = blocks
    .map((b) => ({ b, n: Random.noise2D(centres[b.id][0] * freq + shift, centres[b.id][1] * freq) }))
    .sort((q, r) => q.n - r.n);
  const grown = Math.round(blocks.length * share);
  ranked.forEach(({ b }, i) => (b.kind = i < grown ? 'growth' : 'nalee'));
}

/**
 * Blocks facing each other across a bar: from every cell, look along the
 * four axes up to `reach` cells; past closed cells, the first open cell of
 * another block is a neighbour (meeting the block's own cells first stops).
 */
function neighbours(ids: Int32Array, cols: number, rows: number, reach: number): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const add = (a: number, b: number) => {
    const set = out.get(a) ?? new Set<number>();
    set.add(b);
    out.set(a, set);
  };
  for (let c = 0; c < ids.length; c++) {
    const a = ids[c];
    if (a < 0) continue;
    const cx = c % cols;
    const cy = Math.floor(c / cols);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      // Only cells on a block's edge can see across a bar.
      const nx0 = cx + dx;
      const ny0 = cy + dy;
      if (nx0 >= cols || ny0 >= rows || ids[ny0 * cols + nx0] >= 0) continue;
      for (let t = 2; t <= reach; t++) {
        const nx = cx + dx * t;
        const ny = cy + dy * t;
        if (nx >= cols || ny >= rows) break;
        const b = ids[ny * cols + nx];
        if (b < 0) continue;
        if (b !== a) {
          add(a, b);
          add(b, a);
        }
        break;
      }
    }
  }
  return out;
}

/**
 * Neighbours take opposite kinds: blocks are coloured largest first, each
 * the kind fewer of its already-coloured neighbours have (a 2-colouring
 * where the leading allows one, the fewest clashes where it doesn't). Thin
 * blocks are walked from the start and the rest colour round them.
 */
function assignAlternate(
  blocks: Block[],
  adj: Map<number, Set<number>>,
  thin: (b: Block) => boolean,
  fixed: (b: Block) => BlockKind | undefined = () => undefined,
): void {
  const done = new Set<number>();
  for (const b of blocks) {
    const f = thin(b) ? 'nalee' : fixed(b);
    if (f) {
      b.kind = f;
      done.add(b.id);
    }
  }
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const order = [...blocks].filter((b) => !done.has(b.id)).sort((p, q) => q.area - p.area);
  for (const start of order) {
    if (done.has(start.id)) continue;
    // Breadth first from each uncoloured block, so the colouring spreads
    // through the leading rather than jumping about.
    const queue = [start];
    for (let k = 0; k < queue.length; k++) {
      const b = queue[k];
      if (done.has(b.id)) continue;
      let grown = 0;
      let walked = 0;
      for (const n of adj.get(b.id) ?? []) {
        if (!done.has(n)) continue;
        if (byId.get(n)!.kind === 'growth') grown++;
        else walked++;
      }
      b.kind = grown === walked ? (k === 0 ? (Random.chance(0.5) ? 'growth' : 'nalee') : 'growth') : grown > walked ? 'nalee' : 'growth';
      done.add(b.id);
      for (const n of adj.get(b.id) ?? []) if (!done.has(n)) queue.push(byId.get(n)!);
    }
  }
}
