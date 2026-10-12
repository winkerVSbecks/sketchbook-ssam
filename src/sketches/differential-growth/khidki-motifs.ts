/**
 * Line grills for the `khidki` variant, traced from gates photographed with
 * a pixel-art overlay but drawn as ironwork: straight bars, outlines and solid
 * hubs, in the photo's pixel units with the motif's box at [0, w] × [0, h].
 * Bars lying along the box edges are what ./khidki-field extends to the
 * opening's edges to complete the grill.
 *
 * Every motif draws its left half (and centre line); `symmetric` mirrors it.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */

export type LineMotif = 'turnstile' | 'railing' | 'fan' | 'flower' | 'sunrise';

type Pt = [number, number];
type Segment = [Pt, Pt];

export interface MotifShape {
  w: number;
  h: number;
  /** Bars at the grill's bar weight. */
  bars: Segment[];
  /** Bars at twice the weight: spines, rails, crossbars. */
  heavy: Segment[];
  /** Outlines (leaves, squares, the quatrefoil), closed when first = last. */
  paths: Pt[][];
  /** Solid hubs, `[x, y, w, h]`. */
  plates: [number, number, number, number][];
  /** Solid bosses, `[x, y, r]`. */
  discs: [number, number, number][];
}

const MOTIFS: Record<LineMotif, () => MotifShape> = {
  turnstile,
  railing,
  fan,
  flower,
  sunrise,
};

/** The motif, `repeat` copies side by side. */
export function motifShape(name: LineMotif, repeat: number): MotifShape {
  const one = MOTIFS[name]();
  const n = Math.max(1, Math.round(repeat));
  const out = shape(one.w * n, one.h);
  for (let k = 0; k < n; k++) {
    const dx = k * one.w;
    const at = ([x, y]: Pt): Pt => [x + dx, y];
    out.bars.push(...one.bars.map(([a, b]): Segment => [at(a), at(b)]));
    out.heavy.push(...one.heavy.map(([a, b]): Segment => [at(a), at(b)]));
    out.paths.push(...one.paths.map((p) => p.map(at)));
    out.plates.push(...one.plates.map(([x, y, w, h]): [number, number, number, number] => [x + dx, y, w, h]));
    out.discs.push(...one.discs.map(([x, y, r]): [number, number, number] => [x + dx, y, r]));
  }
  return out;
}

/**
 * The cyan turnstile: a spine capped top and bottom, three crossbars with
 * serifed ends and a square hub, and in each of the four cells either side a
 * hollow square with rays from its corners to the cell's.
 */
function turnstile(): MotifShape {
  const m = shape(32, 72);
  m.heavy.push([
    [16, 0],
    [16, 72],
  ]);
  m.bars.push(
    [
      [13, 0],
      [16, 0],
    ],
    [
      [13, 72],
      [16, 72],
    ],
  );
  for (const y of [18, 36, 54]) {
    m.heavy.push([
      [0, y],
      [16, y],
    ]);
    m.bars.push([
      [0, y - 2.5],
      [0, y + 2.5],
    ]);
    m.plates.push([14, y - 2, 4, 4]);
  }
  for (let k = 0; k < 4; k++) {
    const cy = 9 + 18 * k;
    squareWithRays(m, [5, cy - 3, 11, cy + 3], [0, cy - 9, 16, cy + 9]);
  }
  return symmetric(m);
}

/**
 * The green railing: a lintel of two rails tied by posts, a lattice band of
 * chevrons meeting at a centre cross, a second pair of rails and a row of
 * eight balusters down to the sill.
 */
function railing(): MotifShape {
  const m = shape(32, 50);
  for (const y of [0, 4, 24, 29, 50]) {
    m.bars.push([
      [0, y],
      [16, y],
    ]);
  }
  m.bars.push(
    [
      [10, 0],
      [10, 4],
    ],
    [
      [10, 24],
      [10, 29],
    ],
  );
  for (const x of [2, 6, 10, 14]) {
    m.bars.push([
      [x, 29],
      [x, 50],
    ]);
  }
  m.bars.push(
    [
      [0, 14],
      [2, 14],
    ],
    [
      [13, 14],
      [16, 14],
    ],
    [
      [16, 11],
      [16, 17],
    ],
    [
      [10, 4],
      [1, 14],
    ],
    [
      [1, 14],
      [10, 24],
    ],
    [
      [1, 4],
      [10, 14],
    ],
    [
      [10, 14],
      [1, 24],
    ],
    [
      [10, 4],
      [16, 11],
    ],
    [
      [10, 24],
      [16, 17],
    ],
  );
  return symmetric(m);
}

/**
 * The yellow fan: four leaves reaching from a crossing to the corners of the
 * crown, a broken spine and arms through it, over a heavy rail and seven
 * pickets.
 */
function fan(): MotifShape {
  const m = shape(26, 49);
  for (const x of [1, 5, 9, 13]) {
    m.bars.push([
      [x, 27],
      [x, 49],
    ]);
  }
  m.heavy.push([
    [0, 27],
    [13, 27],
  ]);
  m.bars.push(
    [
      [13, 0],
      [13, 9],
    ],
    [
      [13, 17],
      [13, 27],
    ],
    [
      [0, 13],
      [8, 13],
    ],
    [
      [10, 10],
      [13, 13],
    ],
    [
      [10, 16],
      [13, 13],
    ],
  );
  m.paths.push(
    [
      [10, 10],
      [6, 3],
      [4, 0],
      [0, 0],
      [0, 4],
      [3, 6],
      [10, 10],
    ],
    [
      [10, 16],
      [3, 20],
      [0, 22],
      [0, 27],
      [4, 27],
      [6, 23],
      [10, 16],
    ],
  );
  return symmetric(m);
}

/**
 * The orange flower panels: twin rails each side, and two square panels
 * between banded rails, each holding a quatrefoil round a solid boss, a
 * lattice knot in every crevice and rays from the knots to the corners.
 */
function flower(): MotifShape {
  const m = shape(42, 96);
  m.heavy.push(
    [
      [0, 0],
      [0, 96],
    ],
    [
      [4, 0],
      [4, 96],
    ],
  );
  for (const y of [3, 7, 41, 45, 51, 55, 89, 93]) {
    m.bars.push([
      [0, y],
      [21, y],
    ]);
  }
  for (const y0 of [7, 55]) {
    const cx = 21;
    const cy = y0 + 17;
    m.paths.push(quatrefoil(cx, cy, 7, 6));
    m.discs.push([cx, cy, 3]);
    for (const ky of [cy - 7.5, cy + 7.5]) {
      const kx = cx - 7.5;
      m.bars.push(
        [
          [kx - 2, ky - 1],
          [kx + 2, ky - 1],
        ],
        [
          [kx - 2, ky + 1],
          [kx + 2, ky + 1],
        ],
        [
          [kx - 1, ky - 2],
          [kx - 1, ky + 2],
        ],
        [
          [kx + 1, ky - 2],
          [kx + 1, ky + 2],
        ],
      );
    }
    m.bars.push(
      [
        [4, y0],
        [cx - 10, cy - 10],
      ],
      [
        [4, y0 + 34],
        [cx - 10, cy + 10],
      ],
    );
  }
  return symmetric(m);
}

/**
 * The pink sunrise: rays fanning up off a heavy bar from a stepped bridge,
 * the spine running through to a foot, and two hollow squares with rays to
 * the corners of their cells hung beneath.
 */
function sunrise(): MotifShape {
  const m = shape(30, 35);
  m.bars.push(
    [
      [15, 0],
      [15, 35],
    ],
    [
      [12, 35],
      [15, 35],
    ],
    [
      [0, 17.5],
      [0, 22.5],
    ],
    [
      [7, 1],
      [12.5, 16],
    ],
    [
      [1, 7],
      [10.5, 17],
    ],
    [
      [1, 14],
      [8.5, 18],
    ],
  );
  m.heavy.push([
    [0, 20],
    [15, 20],
  ]);
  m.plates.push([8, 18, 7, 2], [10.5, 16.5, 4.5, 1.5]);
  squareWithRays(m, [5, 25, 10, 30], [0, 20, 15, 35]);
  return symmetric(m);
}

/** A hollow square `sq` with a ray from each corner to the matching corner of `cell`. */
function squareWithRays(m: MotifShape, sq: number[], cell: number[]): void {
  const [x0, y0, x1, y1] = sq;
  const [cx0, cy0, cx1, cy1] = cell;
  m.paths.push([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ]);
  m.bars.push(
    [
      [x0, y0],
      [cx0, cy0],
    ],
    [
      [x1, y0],
      [cx1, cy0],
    ],
    [
      [x0, y1],
      [cx0, cy1],
    ],
    [
      [x1, y1],
      [cx1, cy1],
    ],
  );
}

/**
 * Outline of four lobes of radius `r` set `d` out from (cx, cy). The union is
 * star-shaped from the centre, so its rim — every lobe point outside the
 * others and farther out than the lobe centres — sorted by angle about the centre traces it in order.
 */
function quatrefoil(cx: number, cy: number, d: number, r: number): Pt[] {
  const lobes: Pt[] = [
    [cx + d, cy],
    [cx, cy + d],
    [cx - d, cy],
    [cx, cy - d],
  ];
  const rim: { a: number; p: Pt }[] = [];
  lobes.forEach(([lx, ly], i) => {
    for (let k = 0; k < 96; k++) {
      const t = (k / 96) * Math.PI * 2;
      const p: Pt = [lx + r * Math.cos(t), ly + r * Math.sin(t)];
      // Inner arcs, near the centre, fall outside the other lobes too: drop them.
      const inner = Math.hypot(p[0] - cx, p[1] - cy) < d;
      const inside = lobes.some(([ox, oy], j) => j !== i && Math.hypot(p[0] - ox, p[1] - oy) < r);
      if (!inner && !inside) rim.push({ a: Math.atan2(p[1] - cy, p[0] - cx), p });
    }
  });
  const ring = rim.sort((u, v) => u.a - v.a).map(({ p }) => p);
  return [...ring, ring[0]];
}

function shape(w: number, h: number): MotifShape {
  return { w, h, bars: [], heavy: [], paths: [], plates: [], discs: [] };
}

/** Add the mirror image of everything about the vertical centre line. */
function symmetric(m: MotifShape): MotifShape {
  const fx = ([x, y]: Pt): Pt => [m.w - x, y];
  m.bars.push(...m.bars.map(([a, b]): Segment => [fx(a), fx(b)]));
  m.heavy.push(...m.heavy.map(([a, b]): Segment => [fx(a), fx(b)]));
  m.paths.push(...m.paths.map((p) => p.map(fx)));
  m.plates.push(...m.plates.map(([x, y, w, h]): [number, number, number, number] => [m.w - x - w, y, w, h]));
  m.discs.push(...m.discs.map(([x, y, r]): [number, number, number] => [m.w - x, y, r]));
  return m;
}
