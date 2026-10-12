/**
 * Grilles generated the way grilles are made, not picked from a catalogue.
 *
 * A grille is built in three moves, each a rule with a few choices:
 *
 *   1. symmetry — `none`, `mirror` (left–right) or `quad` (both axes), rolled
 *      with `none` most likely: mirroring is the exception, not the rule. Only
 *      the fundamental domain is designed; it is reflected to fill the
 *      opening, and every mirror line is a bar, as a fabricator would weld
 *      the halves.
 *   2. subdivision — the domain is split recursively into panels: first into
 *      bands (mostly horizontal), then each across its longer side (now and
 *      then the shorter), into parts in ratios from 1:1 to 1:3 and 1:φ,
 *      until a depth limit or a minimum panel size. Every split is a bar.
 *   3. motif — each panel takes one figure from the vocabulary of street
 *      grilles: `rays` (a sunrise from an edge), `cross`, `diamond`,
 *      `medallion` (a circle round a four-pointed star of quarter arcs),
 *      `circle`, `steps` (interlocking key-step brackets), `bars`
 *      (balusters), `asanoha` (the hemp-leaf lattice) or `plain`.
 *
 * The motifs carry no pictorial depth: nothing is a box tied to its corners.
 * One optional disc at the opening's centre is the only knot — a punctum.
 * Output is plain geometry in world units for ./khidki-field.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
import Random from 'canvas-sketch-util/random';

type Pt = [number, number];
type Polyline = Pt[];

export type Symmetry = 'none' | 'mirror' | 'quad';
export const SYMMETRIES: Symmetry[] = ['none', 'mirror', 'quad'];
/** Symmetry as a roll, not a default: mirroring is the exception. */
export const pickSymmetry = (): Symmetry => SYMMETRIES[Random.weighted([6, 3, 1]) as number];
export type Motif = 'rays' | 'cross' | 'diamond' | 'medallion' | 'circle' | 'steps' | 'bars' | 'asanoha' | 'plain';
export const MOTIFS: Motif[] = ['rays', 'cross', 'diamond', 'medallion', 'circle', 'steps', 'bars', 'asanoha', 'plain'];

export interface GrammarOptions {
  /** The opening, in world units. */
  w: number;
  h: number;
  symmetry: Symmetry;
  /** Levels of subdivision of the fundamental domain. */
  depth: number;
  /** Panels smaller than this on either side are not split further. */
  minPanel: number;
  /** One disc at the centre. */
  punctum: boolean;
}

export interface Grille {
  bars: Polyline[];
  /** The first cut's pieces, reflected to cover the opening: the bands. */
  bands: { x: number; y: number; w: number; h: number }[][];
  discs: { x: number; y: number; r: number }[];
  /** The rules as drawn, for the pane. */
  recipe: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const line = (a: Pt, b: Pt): Polyline => [a, b];

function arc(cx: number, cy: number, r: number, a0: number, a1: number): Polyline {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r * 2));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
}

/** From `p` along (dx, dy) to the edge of `r`. */
function toEdge([x, y]: Pt, dx: number, dy: number, r: Rect): Pt {
  const ts = [
    dx > 0 ? (r.x + r.w - x) / dx : dx < 0 ? (r.x - x) / dx : Infinity,
    dy > 0 ? (r.y + r.h - y) / dy : dy < 0 ? (r.y - y) / dy : Infinity,
  ];
  const t = Math.min(...ts);
  return [x + dx * t, y + dy * t];
}

/** Ratios a cut may divide a panel by; repeats weight the common ones. */
const RATIOS: number[][] = [
  [1, 1],
  [1, 1],
  [1, PHI],
  [PHI, 1],
  [1, 2],
  [2, 1],
  [1, 3],
  [3, 1],
  [1, 1, 1],
  [1, 2, 1],
  [2, 1, 1],
  [1, 1, 2],
  [1, 3, 1],
];

/**
 * Split `r` recursively; every cut is pushed to `bars`, every leaf returned.
 * The first cut (`top`) prefers to stack horizontal bands, as grilles are
 * built; later cuts go across the longer side, now and then the shorter, so
 * bands need not keep the verticals of the band above. Ratios are drawn from
 * `RATIOS`, so band heights vary rather than repeat.
 */
function subdivide(r: Rect, depth: number, min: number, bars: Polyline[], top = false, bands?: Rect[]): Rect[] {
  const longer = r.w >= r.h ? 'x' : 'y';
  const across = top ? (Random.chance(0.8) ? 'y' : 'x') : Random.chance(0.8) ? longer : longer === 'x' ? 'y' : 'x';
  const side = across === 'x' ? r.w : r.h;
  const weights = Random.pick(RATIOS) as number[];
  const total = weights.reduce((a, b) => a + b, 0);
  const smallest = (Math.min(...weights) / total) * side;
  if (depth <= 0 || smallest < min || (!top && depth < 3 && Random.chance(0.25))) {
    bands?.push(r);
    return [r];
  }
  const leaves: Rect[] = [];
  let at = 0;
  weights.forEach((wt: number, i: number) => {
    const f = wt / total;
    const piece: Rect =
      across === 'x'
        ? { x: r.x + at * r.w, y: r.y, w: f * r.w, h: r.h }
        : { x: r.x, y: r.y + at * r.h, w: r.w, h: f * r.h };
    at += f;
    if (i > 0) {
      bars.push(
        across === 'x'
          ? line([piece.x, r.y], [piece.x, r.y + r.h])
          : line([r.x, piece.y], [r.x + r.w, piece.y]),
      );
    }
    // The pieces of the first cut are the work's bands.
    if (top) bands?.push(piece);
    leaves.push(...subdivide(piece, depth - 1, min, bars));
  });
  return leaves;
}

/** One motif drawn into panel `r`. */
function motif(m: Motif, r: Rect, bars: Polyline[]): void {
  const [x0, y0, x1, y1] = [r.x, r.y, r.x + r.w, r.y + r.h];
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const s = Math.min(r.w, r.h);
  switch (m) {
    case 'cross':
      bars.push(line([x0, y0], [x1, y1]), line([x1, y0], [x0, y1]));
      break;
    case 'diamond':
      bars.push([
        [cx, y0],
        [x1, cy],
        [cx, y1],
        [x0, cy],
        [cx, y0],
      ]);
      break;
    case 'circle':
      bars.push(arc(cx, cy, s * 0.42, 0, 2 * Math.PI));
      break;
    case 'medallion': {
      // A circle round a four-pointed star: quarter arcs centred on the
      // corners of the circle's bounding square, as in the circles gate.
      const rr = s * 0.45;
      const q = Math.PI / 2;
      bars.push(arc(cx, cy, rr, 0, 2 * Math.PI));
      for (const [sx, sy, a0] of [
        [1, -1, q],
        [-1, -1, 0],
        [-1, 1, -q],
        [1, 1, Math.PI],
      ]) {
        bars.push(arc(cx + sx * rr, cy + sy * rr, rr, a0, a0 + q));
      }
      break;
    }
    case 'rays': {
      // A sunrise from the middle of the bottom (or top) edge: a half disc,
      // and an odd number of rays fanned evenly to the other three edges.
      const up = Random.chance(0.7);
      const o: Pt = [cx, up ? y1 : y0];
      const hub = s * 0.16;
      const n = Random.pick([5, 7, 9]);
      bars.push(arc(o[0], o[1], hub, up ? Math.PI : 0, up ? 2 * Math.PI : Math.PI));
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * (i + 1)) / (n + 1);
        const [dx, dy] = [Math.cos(a), up ? -Math.sin(a) : Math.sin(a)];
        bars.push(line([o[0] + dx * hub, o[1] + dy * hub], toEdge(o, dx, dy, r)));
      }
      break;
    }
    case 'bars': {
      const n = Math.max(2, Math.round(r.w / (s * 0.3)));
      for (let i = 1; i < n; i++) bars.push(line([x0 + (r.w * i) / n, y0], [x0 + (r.w * i) / n, y1]));
      break;
    }
    case 'steps': {
      // Interlocking key steps: rows alternate a centre bracket and a pair
      // from the sides, each end dropping to the row below.
      const rows = Math.max(3, Math.round(r.h / (r.w * 0.28)));
      const dy = r.h / rows;
      const [c0, c1] = [x0 + r.w * 0.22, x1 - r.w * 0.22];
      const [sl, sr] = [x0 + r.w * 0.38, x1 - r.w * 0.38];
      for (let k = 0; k < rows - 1; k++) {
        const y = y0 + (k + 0.5) * dy;
        const below = y + dy;
        if (k % 2 === 0) {
          bars.push([
            [c0, below],
            [c0, y],
            [c1, y],
            [c1, below],
          ]);
        } else {
          bars.push(
            [
              [x0, y],
              [sl, y],
              [sl, below],
            ],
            [
              [x1, y],
              [sr, y],
              [sr, below],
            ],
          );
        }
      }
      break;
    }
    case 'asanoha': {
      // The hemp leaf: a lattice of equilateral triangles, each split three
      // ways by spokes from its corners to its centre. Centred on the panel
      // so mirrored panels stay symmetric; triangles at least 16 units on a
      // side, so the slivers are wide enough for a curve to settle in.
      const t = Math.max(16, s / Random.pick([1, 1.5, 2]));
      const th = (t * Math.sqrt(3)) / 2;
      const rows = Math.ceil(r.h / th / 2) + 1;
      const cols = Math.ceil(r.w / t / 2) + 1;
      for (let j = -rows; j < rows; j++) {
        const ya = cy + j * th;
        const yb = ya + th;
        const shift = (Math.abs(j) % 2) * (t / 2);
        for (let i = -cols - 1; i <= cols; i++) {
          const xa = cx + i * t + shift;
          // An upward triangle and the downward one beside it.
          const tris: Pt[][] = [
            [
              [xa, yb],
              [xa + t / 2, ya],
              [xa + t, yb],
            ],
            [
              [xa + t / 2, ya],
              [xa + t, yb],
              [xa + (3 * t) / 2, ya],
            ],
          ];
          for (const [a, b, c] of tris) {
            const g: Pt = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
            for (const [p, q] of [
              [a, b],
              [b, c],
              [c, a],
              [a, g],
              [b, g],
              [c, g],
            ] as [Pt, Pt][]) {
              const seg = clip(p, q, r);
              if (seg) bars.push(seg);
            }
          }
        }
      }
      break;
    }
    case 'plain':
      break;
  }
}

/** Segment p–q clipped to rect `r` (Liang–Barsky); null when wholly outside. */
function clip(p: Pt, q: Pt, r: Rect): Polyline | null {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  let t0 = 0;
  let t1 = 1;
  for (const [pp, qq] of [
    [-dx, p[0] - r.x],
    [dx, r.x + r.w - p[0]],
    [-dy, p[1] - r.y],
    [dy, r.y + r.h - p[1]],
  ]) {
    if (pp === 0) {
      if (qq < 0) return null;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  if (t1 - t0 < 1e-6) return null;
  return [
    [p[0] + dx * t0, p[1] + dy * t0],
    [p[0] + dx * t1, p[1] + dy * t1],
  ];
}

/** Reflect polylines across the opening's mirror lines. */
function reflect(bars: Polyline[], sym: Symmetry, w: number, h: number): Polyline[] {
  const flipX = (pl: Polyline): Polyline => pl.map(([x, y]) => [w - x, y]);
  const flipY = (pl: Polyline): Polyline => pl.map(([x, y]) => [x, h - y]);
  if (sym === 'none') return bars;
  const mirrored = [...bars, ...bars.map(flipX)];
  return sym === 'mirror' ? mirrored : [...mirrored, ...mirrored.map(flipY)];
}

export function generateGrille(o: GrammarOptions): Grille {
  const { w, h, symmetry } = o;
  const domain: Rect = {
    x: 0,
    y: 0,
    w: symmetry === 'none' ? w : w / 2,
    h: symmetry === 'quad' ? h / 2 : h,
  };
  const bars: Polyline[] = [];
  const top: Rect[] = [];
  const panels = subdivide(domain, o.depth, o.minPanel, bars, true, top);
  // Motifs are drawn per panel, but panels of one shape share one motif, so
  // repeats read as a pattern rather than noise.
  const byShape = new Map<string, Motif>();
  const used: Motif[] = [];
  for (const p of panels) {
    const key = `${p.w.toFixed(2)}x${p.h.toFixed(2)}`;
    if (!byShape.has(key)) {
      // Rays are rare: a sunrise reads as a picture, a landscape.
      const m = MOTIFS[Random.weighted([0.5, 2, 2, 2, 1, 2, 2, 2, 3]) as number];
      byShape.set(key, m);
      used.push(m);
    }
    motif(byShape.get(key)!, p, bars);
  }
  const all = reflect(bars, symmetry, w, h);
  if (symmetry !== 'none') all.push(line([w / 2, 0], [w / 2, h]));
  if (symmetry === 'quad') all.push(line([0, h / 2], [w, h / 2]));
  // Each band with its mirror images, so a band's texture rule holds
  // across the reflection.
  const images = (b: Rect): Rect[] => {
    const out = [b];
    if (symmetry !== 'none') out.push({ ...b, x: w - b.x - b.w });
    if (symmetry === 'quad') out.push(...out.map((q) => ({ ...q, y: h - q.y - q.h })));
    return out;
  };
  return {
    bands: top.map(images),
    bars: all,
    discs: o.punctum ? [{ x: w / 2, y: h / 2, r: Math.min(w, h) * 0.035 }] : [],
    recipe: `${symmetry} · ${panels.length} panels · ${used.join(', ')}`,
  };
}
