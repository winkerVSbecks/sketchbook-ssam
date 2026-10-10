import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../colors/riso';

// Wave function collapse over the paint-without-thinking quarter-arc tile set,
// then the rounded reduction from arcs-reduction-rounded: drop full squares that
// end up alone and round every square corner whose two neighbours are open.

Random.setSeed(Random.getRandomSeed());
console.log(`Seed: ${Random.getSeed()}`);

const config = {
  res: [24, 14] as [number, number],
  margin: 40,
  // r as a fraction of the cell: 0.5 turns a lone square into a circle
  r: 0.5,
  maxAttempts: 40,
};

// Tiles, after arcs-reduction-rounded's cells:
//   blank, '0123' (full square), and the four quarter discs named by the
//   corners they keep — the disc is centred on the corner opposite the arc.
type Tile = 'blank' | 'full' | 'tl' | 'tr' | 'br' | 'bl';
const TILES: Tile[] = ['blank', 'full', 'tl', 'tr', 'br', 'bl'];

// Edge sockets [top, right, bottom, left]:
//   E = empty, S = a disc's straight solid side, F = a square's flat side.
// S meets S, E meets E, and F meets anything — the square is the one tile
// allowed to sit on an outline, which is what gives the reduction work to do.
const E = 0;
const S = 1;
const F = 2;
type Socket = typeof E | typeof S | typeof F;
const sockets: Record<Tile, [Socket, Socket, Socket, Socket]> = {
  blank: [E, E, E, E],
  full: [F, F, F, F],
  tl: [S, E, E, S],
  tr: [S, S, E, E],
  br: [E, S, S, E],
  bl: [E, E, S, S],
};
const weights: Record<Tile, number> = { blank: 3.2, full: 1.1, tl: 1, tr: 1, br: 1, bl: 1 };

const fits = (a: Socket, b: Socket) => a === b || a === F || b === F;
const solid = (t: Tile, side: number) => sockets[t][side] !== E;

// dx, dy for [top, right, bottom, left]; the facing side is (side + 2) % 4
const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// compat[a][side] = bitmask of tiles that may sit on that side of tile a
const compat: number[][] = TILES.map((a) =>
  DIRS.map((_, side) =>
    TILES.reduce(
      (mask, b, j) => (fits(sockets[a][side], sockets[b][(side + 2) % 4]) ? mask | (1 << j) : mask),
      0,
    ),
  ),
);
// tiles whose side faces the frame must be empty or flat
const borderMask = (side: number) =>
  TILES.reduce((mask, t, j) => (sockets[t][side] !== S ? mask | (1 << j) : mask), 0);

const ALL = (1 << TILES.length) - 1;
const bits = (mask: number) => TILES.map((_, j) => j).filter((j) => mask & (1 << j));

function solve(cols: number, rows: number): Tile[] | null {
  const wave = new Array<number>(cols * rows).fill(ALL);
  const stack: number[] = [];

  const constrain = (i: number, mask: number) => {
    const next = wave[i] & mask;
    if (next === wave[i]) return true;
    wave[i] = next;
    stack.push(i);
    return next !== 0;
  };

  // the frame reads as empty, so shapes close before the edge
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (y === 0) constrain(i, borderMask(0));
      if (x === cols - 1) constrain(i, borderMask(1));
      if (y === rows - 1) constrain(i, borderMask(2));
      if (x === 0) constrain(i, borderMask(3));
    }
  }

  const propagate = () => {
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % cols;
      const y = Math.floor(i / cols);
      for (let side = 0; side < 4; side++) {
        const nx = x + DIRS[side][0];
        const ny = y + DIRS[side][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const allowed = bits(wave[i]).reduce((m, j) => m | compat[j][side], 0);
        if (!constrain(ny * cols + nx, allowed)) return false;
      }
    }
    return true;
  };

  if (!propagate()) return null;

  for (;;) {
    // lowest weighted entropy, ties broken by a little noise
    let best = -1;
    let bestH = Infinity;
    for (let i = 0; i < wave.length; i++) {
      const opts = bits(wave[i]);
      if (opts.length < 2) continue;
      const ws = opts.map((j) => weights[TILES[j]]);
      const sum = ws.reduce((a, b) => a + b, 0);
      const h = Math.log(sum) - ws.reduce((a, w) => a + w * Math.log(w), 0) / sum;
      const hn = h + Random.value() * 1e-3;
      if (hn < bestH) {
        bestH = hn;
        best = i;
      }
    }
    if (best === -1) break;

    const opts = bits(wave[best]);
    const pick = Random.weighted(opts.map((j) => weights[TILES[j]]));
    wave[best] = 1 << opts[pick];
    stack.push(best);
    if (!propagate()) return null;
  }

  return wave.map((m) => TILES[bits(m)[0]]);
}

type Corners = [boolean, boolean, boolean, boolean]; // TL, TR, BR, BL

interface Cell {
  x: number;
  y: number;
  tile: Tile;
  region: number;
  color: string;
  corners: Corners;
}

function drawCell(context: CanvasRenderingContext2D, c: Cell, s: number, r: number) {
  const x = c.x * s;
  const y = c.y * s;
  context.fillStyle = c.color;
  context.beginPath();
  switch (c.tile) {
    case 'blank':
      return;
    case 'full':
      context.roundRect(
        x,
        y,
        s,
        s,
        c.corners.map((k) => (k ? r : 0)),
      );
      break;
    case 'tl':
      context.moveTo(x, y);
      context.arc(x, y, s, 0, Math.PI / 2);
      break;
    case 'tr':
      context.moveTo(x + s, y);
      context.arc(x + s, y, s, Math.PI / 2, Math.PI);
      break;
    case 'br':
      context.moveTo(x + s, y + s);
      context.arc(x + s, y + s, s, Math.PI, Math.PI * 1.5);
      break;
    case 'bl':
      context.moveTo(x, y + s);
      context.arc(x, y + s, s, Math.PI * 1.5, Math.PI * 2);
      break;
  }
  context.closePath();
  context.fill();
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  wrap.render = ({ width, height }: SketchProps) => {
    const [cols, rows] = config.res;
    const { bg, inkColors } = randomPalette(3);
    const inks = Random.shuffle(inkColors).slice(0, Random.rangeFloor(2, 4));

    let tiles: Tile[] | null = null;
    for (let a = 0; a < config.maxAttempts && !tiles; a++) tiles = solve(cols, rows);
    tiles ??= new Array<Tile>(cols * rows).fill('blank');

    const grid: Cell[] = tiles.map((tile, i) => ({
      x: i % cols,
      y: Math.floor(i / cols),
      tile,
      region: -1,
      color: bg,
      corners: [false, false, false, false],
    }));
    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= cols || y >= rows ? undefined : grid[y * cols + x];

    // regions: flood fill across shared edges that are solid on both sides,
    // like wave-function-collapse/4's colour-by-connection
    let regions = 0;
    const sizes: number[] = [];
    for (const start of grid) {
      if (start.tile === 'blank' || start.region !== -1) continue;
      const color = Random.pick(inks);
      const queue = [start];
      start.region = regions;
      let size = 0;
      while (queue.length) {
        const c = queue.pop()!;
        c.color = color;
        size++;
        DIRS.forEach(([dx, dy], side) => {
          const n = at(c.x + dx, c.y + dy);
          if (!n || n.region !== -1 || n.tile === 'blank') return;
          if (!solid(c.tile, side) || !solid(n.tile, (side + 2) % 4)) return;
          n.region = regions;
          queue.push(n);
        });
      }
      sizes.push(size);
      regions++;
    }

    // reduction: a cell that shares no solid edge with its own colour goes to ground
    for (const c of grid) {
      if (c.tile !== 'blank' && sizes[c.region] === 1) {
        c.tile = 'blank';
        c.color = bg;
      }
    }

    // rounding: a square corner whose two neighbours both turn an open edge to it
    const open = (n: Cell | undefined, side: number) => !n || !solid(n.tile, side);
    for (const c of grid) {
      if (c.tile !== 'full') continue;
      const top = open(at(c.x, c.y - 1), 2);
      const right = open(at(c.x + 1, c.y), 3);
      const bottom = open(at(c.x, c.y + 1), 0);
      const left = open(at(c.x - 1, c.y), 1);
      c.corners = [top && left, top && right, bottom && right, bottom && left];
    }

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const s = Math.min(
      (width - config.margin * 2) / cols,
      (height - config.margin * 2) / rows,
    );
    context.save();
    context.translate((width - s * cols) / 2, (height - s * rows) / 2);
    for (const c of grid) drawCell(context, c, s, s * config.r);
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1040, 640],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  prefix: 'arc-tiles-',
};

ssam(sketch as Sketch<'2d'>, settings);
