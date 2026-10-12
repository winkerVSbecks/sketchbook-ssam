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
 * The other motifs swap in a gate's grill (./khidki-motifs), fitted to the
 * opening and centred; every bar along the motif's edge runs on to the
 * opening's edge, so the grill spans the whole window.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
import Random from 'canvas-sketch-util/random';

import { createGrowth, type Growth } from '../terminal-ui/growth-sim';
import { motifShape, type LineMotif } from './khidki-motifs';
import { createConfiner, createMask, naleeWalks, type LatticePoint, type RegionMask } from './region';

/** Bar pitch, in world units. */
export const PITCH = 10;
export const APERTURE_W = 5.4 * PITCH;
export const APERTURE_H = 7.1 * PITCH;
/** Mask resolution, in world units per cell. */
const RES = 0.25;
/** Blocks larger than this (world units²) are always walked: one curve
 * can't fill the wide side bays of a gate in any sensible warm-up. */
const MAX_GROWN_AREA = 4 * PITCH * PITCH;
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
  /** Gate motifs: bars at twice the weight. */
  heavy: Segment[];
  /** Gate motifs: outlines, closed when first = last. */
  paths: Pt[][];
  /** Gate motifs: solid hubs `[x, y, w, h]` and bosses `[x, y, r]`. */
  plates: [number, number, number, number][];
  discs: [number, number, number][];
}

/** The khidki's bar-and-lozenge grill, or one of the gates. */
export type Motif = 'khidki' | LineMotif;

export interface GrillOptions {
  motif: Motif;
  /** Gate motifs: copies side by side. */
  repeat: number;
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
  return { bars, lozenges, circles, diamonds, circleR: o.knot * 0.17 * s, diamondR: o.knot * 0.19 * s,
    heavy: [],
    paths: [],
    plates: [],
    discs: [],
  };
}

/**
 * A gate motif scaled to fit the opening and centred. Horizontal bars that
 * reach the motif's left or right edge run on to the opening's, vertical bars
 * at its top or bottom likewise, so the grill spans the whole window.
 */
function gateGrill(name: LineMotif, repeat: number): Grill {
  const m = motifShape(name, repeat);
  const k = Math.min(APERTURE_W / m.w, APERTURE_H / m.h);
  const ox = (APERTURE_W - m.w * k) / 2;
  const oy = (APERTURE_H - m.h * k) / 2;
  const at = ([x, y]: Pt): Pt => [ox + x * k, oy + y * k];
  const eps = 1e-6;
  const extend = ([a, b]: Segment): Segment => {
    const [p, q] = [at(a), at(b)];
    if (a[1] === b[1]) {
      const [l, r] = p[0] <= q[0] ? [p, q] : [q, p];
      if (Math.min(a[0], b[0]) < eps) l[0] = 0;
      if (Math.max(a[0], b[0]) > m.w - eps) r[0] = APERTURE_W;
    } else if (a[0] === b[0]) {
      const [t, u] = p[1] <= q[1] ? [p, q] : [q, p];
      if (Math.min(a[1], b[1]) < eps) t[1] = 0;
      if (Math.max(a[1], b[1]) > m.h - eps) u[1] = APERTURE_H;
    }
    return [p, q];
  };
  return {
    bars: m.bars.map(extend),
    heavy: m.heavy.map(extend),
    paths: m.paths.map((path) => path.map(at)),
    plates: m.plates.map(([x, y, w, h]) => [ox + x * k, oy + y * k, w * k, h * k]),
    discs: m.discs.map(([x, y, r]) => [ox + x * k, oy + y * k, r * k]),
    lozenges: [],
    circles: [],
    diamonds: [],
    circleR: 0,
    diamondR: 0,
  };
}

function segDist([px, py]: Pt, [[ax, ay], [bx, by]]: Segment): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

export type BlockKind = 'growth' | 'nalee';
/** How blocks are assigned a kind: whole lozenge stars, or noise patches. */
export type FillPattern = 'stars' | 'patches';
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
  grill: Grill;
  mask: RegionMask;
  blocks: Block[];
  /** Walk lattice pitch, in world units. */
  walkPitch: number;
  step(): void;
}

export interface FieldOptions extends GrillOptions {
  pattern: FillPattern;
  /** Stars (khidki motif only; gates fall back to patches): centre on
   * circles at odd or even grill positions. */
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
}

export function createKhidkiField(o: FieldOptions): KhidkiField {
  const gate = o.motif !== 'khidki';
  const grill = gate ? gateGrill(o.motif as LineMotif, o.repeat) : makeGrill(o);
  const thin = [...grill.bars, ...grill.paths.flatMap((p) => p.slice(1).map((q, i): Segment => [p[i], q]))];
  const cols = Math.ceil(APERTURE_W / RES);
  const rows = Math.ceil(APERTURE_H / RES);
  const mask = createMask(cols, rows, RES);

  // Close every cell under the bars and circles. Diamonds close nothing: the
  // fills run on underneath and the diamonds sit on top of them.
  const open = new Uint8Array(cols * rows);
  const half = o.bar / 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p: Pt = [(x + 0.5) * RES, (y + 0.5) * RES];
      const shut =
        thin.some((seg) => segDist(p, seg) < half) ||
        grill.heavy.some((seg) => segDist(p, seg) < 2 * half) ||
        grill.circles.some(([cx, cy]) => Math.hypot(p[0] - cx, p[1] - cy) < grill.circleR) ||
        grill.discs.some(([cx, cy, r]) => Math.hypot(p[0] - cx, p[1] - cy) < r) ||
        grill.plates.some(([x0, y0, w, h]) => p[0] > x0 && p[0] < x0 + w && p[1] > y0 && p[1] < y0 + h);
      open[y * cols + x] = shut ? 0 : 1;
    }
  }

  // Each 4-connected run of open cells is a block; slivers too small to hold
  // a loop of curve or a walk stay closed.
  const minCells = Math.ceil((2 * o.radius) ** 2 / (RES * RES));
  const blocks: Block[] = [];
  const centres: Pt[] = [];
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

  if (o.pattern === 'stars' && !gate) assignStars(blocks, centres, o.starSet, o.starPick);
  else assignPatches(blocks, centres, o.growthShare, o.groupSize);
  for (const block of blocks) if (block.area > MAX_GROWN_AREA) block.kind = 'nalee';

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
