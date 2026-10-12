/**
 * Pixel grills for the `khidki` variant, traced from gates photographed with
 * a pixel-art overlay: each motif is a left–right symmetric bitmap whose set
 * pixels are the ironwork. Diagonals are 8-connected staircases — pixels
 * touching only at corners — which still wall off the open blocks either side
 * of them, since blocks are 4-connected.
 *
 * Every motif draws its left half (and centre column); `symmetric` mirrors it.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */

export type PixelMotif = 'turnstile' | 'railing' | 'fan' | 'flower' | 'sunrise';

export interface Bitmap {
  cols: number;
  rows: number;
  /** 1 where the ironwork is, row-major. */
  on: Uint8Array;
}

interface Pen {
  bitmap: Bitmap;
  plot(x: number, y: number): void;
  /** 8-connected staircase from (x0, y0) to (x1, y1), both ends included. */
  line(x0: number, y0: number, x1: number, y1: number): void;
  /** Filled rectangle, corners included. */
  rect(x0: number, y0: number, x1: number, y1: number): void;
  /** One-pixel outline of a rectangle, corners included. */
  box(x0: number, y0: number, x1: number, y1: number): void;
}

const MOTIFS: Record<PixelMotif, () => Bitmap> = {
  turnstile,
  railing,
  fan,
  flower,
  sunrise,
};

/** The motif's bitmap, `repeat` copies side by side. */
export function motifBitmap(name: PixelMotif, repeat: number): Bitmap {
  const one = MOTIFS[name]();
  const n = Math.max(1, Math.round(repeat));
  const cols = one.cols * n;
  const on = new Uint8Array(cols * one.rows);
  for (let y = 0; y < one.rows; y++) {
    for (let x = 0; x < cols; x++) on[y * cols + x] = one.on[y * one.cols + (x % one.cols)];
  }
  return { cols, rows: one.rows, on };
}

/**
 * The cyan turnstile: a spine capped top and bottom, three crossbars with
 * serifed ends and a square hub, and in each of the four cells either side a
 * hollow square with a staircase leaving each corner.
 */
function turnstile(): Bitmap {
  const p = createPen(34, 73);
  p.rect(16, 0, 16, 72);
  p.rect(13, 0, 16, 1);
  p.rect(13, 71, 16, 72);
  for (const y of [18, 36, 54]) {
    p.rect(0, y, 16, y + 1);
    p.rect(0, y - 2, 1, y + 3);
    p.rect(15, y - 1, 16, y + 2);
  }
  for (let k = 0; k < 4; k++) {
    const top = k === 0 ? 0 : 18 * k + 2;
    const bottom = k === 3 ? 72 : 18 * (k + 1) - 1;
    const sy = Math.round((top + bottom) / 2 - 2.5);
    squareWithRays(p, 5, sy, 10, sy + 5, 4);
  }
  return symmetric(p.bitmap);
}

/**
 * The green railing: a lintel of two rails tied by posts, a lattice band of
 * chevrons meeting at a centre cross, a second pair of rails and a row of
 * eight balusters down to the sill.
 */
function railing(): Bitmap {
  const p = createPen(33, 51);
  for (const y of [0, 4, 24, 29, 50]) p.rect(0, y, 16, y);
  p.rect(10, 0, 10, 4);
  p.rect(10, 24, 10, 29);
  for (const x of [2, 6, 10, 14]) p.rect(x, 29, x, 50);
  p.rect(0, 14, 2, 14);
  p.rect(13, 14, 16, 14);
  p.rect(16, 11, 16, 17);
  p.line(10, 5, 1, 14);
  p.line(1, 14, 10, 23);
  p.line(1, 5, 10, 14);
  p.line(10, 14, 1, 23);
  p.line(10, 5, 16, 11);
  p.line(10, 23, 16, 17);
  return symmetric(p.bitmap);
}

/**
 * The yellow fan: four leaves reaching from a crossing to the corners of the
 * crown, a broken spine and arms through it, over a heavy rail and seven
 * pickets.
 */
function fan(): Bitmap {
  const p = createPen(27, 50);
  for (const x of [1, 5, 9, 13]) p.rect(x, 28, x, 49);
  p.rect(0, 26, 13, 27);
  p.rect(13, 0, 13, 9);
  p.rect(13, 17, 13, 26);
  p.rect(0, 13, 8, 13);
  p.line(9, 9, 13, 13);
  p.line(9, 17, 13, 13);
  // Upper leaf: a corner, then two staircases closing on the crossing.
  p.rect(0, 0, 3, 0);
  p.rect(0, 0, 0, 3);
  p.line(4, 1, 9, 8);
  p.line(1, 4, 8, 9);
  // Lower leaf, rooted on the rail.
  p.rect(0, 22, 0, 25);
  p.line(1, 21, 8, 17);
  p.line(4, 25, 9, 18);
  return symmetric(p.bitmap);
}

/**
 * The orange flower panels: twin rails each side, and two square panels
 * between banded rails, each holding a quatrefoil round a solid boss, a
 * lattice knot in every crevice and staircases from the knots to the corners.
 */
function flower(): Bitmap {
  const p = createPen(43, 97);
  p.rect(0, 0, 0, 96);
  p.rect(4, 0, 4, 96);
  for (const y of [3, 7, 41, 45, 51, 55, 89, 93]) p.rect(4, y, 21, y);
  for (const y0 of [7, 55]) {
    const cx = 21;
    const cy = y0 + 17;
    const lobes = [
      [cx - 7, cy],
      [cx + 7, cy],
      [cx, cy - 7],
      [cx, cy + 7],
    ];
    const inFoil = (x: number, y: number) => lobes.some(([lx, ly]) => Math.hypot(x - lx, y - ly) <= 6);
    for (let y = y0 + 1; y < y0 + 34; y++) {
      for (let x = 5; x <= cx; x++) {
        const edge = inFoil(x, y) && (!inFoil(x + 1, y) || !inFoil(x - 1, y) || !inFoil(x, y + 1) || !inFoil(x, y - 1));
        if (edge || Math.hypot(x - cx, y - cy) <= 3.5) p.plot(x, y);
      }
    }
    for (const [kx, ky] of [
      [cx - 6, cy - 6],
      [cx - 6, cy + 6],
    ]) {
      p.rect(kx - 2, ky - 1, kx + 2, ky - 1);
      p.rect(kx - 2, ky + 1, kx + 2, ky + 1);
      p.rect(kx - 1, ky - 2, kx - 1, ky + 2);
      p.rect(kx + 1, ky - 2, kx + 1, ky + 2);
    }
    p.line(5, y0 + 1, cx - 9, cy - 9);
    p.line(5, y0 + 33, cx - 9, cy + 9);
  }
  return symmetric(p.bitmap);
}

/**
 * The pink sunrise: rays fanning up off a heavy bar from a stepped bridge,
 * the spine running through to a foot, and two hollow squares with corner
 * staircases hung beneath.
 */
function sunrise(): Bitmap {
  const p = createPen(31, 36);
  p.rect(15, 0, 15, 35);
  p.rect(13, 35, 15, 35);
  p.rect(0, 19, 15, 20);
  p.rect(0, 18, 0, 21);
  p.rect(8, 18, 12, 18);
  p.rect(10, 17, 12, 17);
  p.rect(13, 16, 15, 16);
  p.line(7, 1, 12, 15);
  p.line(1, 7, 10, 16);
  p.line(1, 14, 8, 17);
  squareWithRays(p, 5, 25, 9, 29, 4);
  return symmetric(p.bitmap);
}

/** A hollow square with a staircase of `reach` pixels leaving each corner. */
function squareWithRays(p: Pen, x0: number, y0: number, x1: number, y1: number, reach: number): void {
  p.box(x0, y0, x1, y1);
  p.line(x0 - 1, y0 - 1, x0 - reach, y0 - reach);
  p.line(x1 + 1, y0 - 1, x1 + reach, y0 - reach);
  p.line(x0 - 1, y1 + 1, x0 - reach, y1 + reach);
  p.line(x1 + 1, y1 + 1, x1 + reach, y1 + reach);
}

function createPen(cols: number, rows: number): Pen {
  const bitmap: Bitmap = { cols, rows, on: new Uint8Array(cols * rows) };
  const plot = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < cols && y < rows) bitmap.on[y * cols + x] = 1;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) plot(x, y);
    }
  };
  return {
    bitmap,
    plot,
    rect,
    line(x0, y0, x1, y1) {
      // Bresenham: one pixel per step along the major axis.
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let [x, y] = [x0, y0];
      for (;;) {
        plot(x, y);
        if (x === x1 && y === y1) return;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
    },
    box(x0, y0, x1, y1) {
      rect(x0, y0, x1, y0);
      rect(x0, y1, x1, y1);
      rect(x0, y0, x0, y1);
      rect(x1, y0, x1, y1);
    },
  };
}

/** Mirror the left half onto the right. */
function symmetric(b: Bitmap): Bitmap {
  for (let y = 0; y < b.rows; y++) {
    for (let x = 0; x < b.cols; x++) {
      const i = y * b.cols + x;
      b.on[i] |= b.on[y * b.cols + (b.cols - 1 - x)];
    }
  }
  return b;
}
