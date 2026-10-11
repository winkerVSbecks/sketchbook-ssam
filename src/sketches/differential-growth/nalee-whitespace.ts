/**
 * nalee-whitespace — differential-growth with the rest of its grid filled.
 *
 * The organism still packs a polyomino grown from the centre of a
 * `GRID`×`GRID` grid (see ./differential-growth). Here the empty cells are no
 * longer ground: each is split into a `SUB`×`SUB` lattice and nalee walkers
 * (hold a direction, bounce at walls, die when boxed in, spawn until every
 * node is taken) tile the whole white space as one connected field of
 * orthogonal paths. The pitch is close to the curve's own spacing, so both
 * halves carry the same density — one grown, one walked.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { cuspPalette } from '../../colors/cusphanger';
import { createGrowth, type GrowthNode } from '../terminal-ui/growth-sim';
import { naleeWalks } from './region';

/** Domain grid: `GRID`×`GRID` cells of `CELL` world units each. */
const GRID = 9;
const CELL = 6;
/** Share of the grid the polyomino takes. */
const FILL = 0.42;
/** Nodes are kept this far inside the domain's edge, in world units. */
const MARGIN = 0.45;
const MAX_NODES = 9000;
/** Steps run before the first frame (bounded by `WARMUP_MS`). */
const WARMUP_STEPS = 1400;
const WARMUP_MS = 6000;
const STEPS_PER_FRAME = 2;
/** Band width, as a fraction of the repulsion radius. */
const BAND = 0.55;
/** Lattice nodes per side of an empty cell. */
const SUB = 6;

type Cells = boolean[][];

/**
 * A nalee-style clipped domain: start from the centre cell and keep adding a
 * random cell that touches the shape, so it stays one orthogonally connected
 * piece with arms and notches the system chose, not a hand-drawn outline.
 */
function growDomain(): { cells: Cells; start: [number, number] } {
  const cells: Cells = Array.from({ length: GRID }, () => Array<boolean>(GRID).fill(false));
  const c = Math.floor(GRID / 2);
  cells[c][c] = true;
  let count = 1;
  const target = Math.round(GRID * GRID * FILL);
  while (count < target) {
    const frontier: [number, number][] = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (cells[y][x]) continue;
        const touches =
          cells[y - 1]?.[x] || cells[y + 1]?.[x] || cells[y][x - 1] || cells[y][x + 1];
        if (touches) frontier.push([x, y]);
      }
    }
    const [x, y] = Random.pick(frontier);
    cells[y][x] = true;
    count++;
  }
  return { cells, start: [c, c] };
}

const filled = (cells: Cells, x: number, y: number): boolean => {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  return cells[cy]?.[cx] ?? false;
};

/** The nearest point at least `MARGIN` inside any filled cell. */
function project(cells: Cells, p: GrowthNode): void {
  let best = Infinity;
  let bx = p.x;
  let by = p.y;
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      if (!cells[cy][cx]) continue;
      // Shrink only along sides that face empty cells, so the inside of the
      // domain stays seamless across neighbouring cells.
      const x0 = cx * CELL + (cells[cy][cx - 1] ? 0 : MARGIN);
      const x1 = (cx + 1) * CELL - (cells[cy][cx + 1] ? 0 : MARGIN);
      const y0 = cy * CELL + (cells[cy - 1]?.[cx] ? 0 : MARGIN);
      const y1 = (cy + 1) * CELL - (cells[cy + 1]?.[cx] ? 0 : MARGIN);
      const qx = Math.min(x1, Math.max(x0, p.x));
      const qy = Math.min(y1, Math.max(y0, p.y));
      const d = (qx - p.x) ** 2 + (qy - p.y) ** 2;
      if (d < best) {
        best = d;
        bx = qx;
        by = qy;
      }
    }
  }
  p.x = bx;
  p.y = by;
}

/** True when `p` sits in the margin strip along an outside edge. */
function inMargin(cells: Cells, p: GrowthNode): boolean {
  const cx = Math.floor(p.x / CELL);
  const cy = Math.floor(p.y / CELL);
  const lx = p.x - cx * CELL;
  const ly = p.y - cy * CELL;
  return (
    (lx < MARGIN && !cells[cy]?.[cx - 1]) ||
    (lx > CELL - MARGIN && !cells[cy]?.[cx + 1]) ||
    (ly < MARGIN && !cells[cy - 1]?.[cx]) ||
    (ly > CELL - MARGIN && !cells[cy + 1]?.[cx])
  );
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log(seed);

  const palette = cuspPalette({ count: 1 });
  const bg = palette.bg.css;
  const ink = palette.tiers.high[0].css;
  const accent = palette.tiers.mid[0].css;

  const { cells, start } = growDomain();
  const growth = createGrowth({
    seed: Random.rangeFloor(1, 0xffffff),
    origin: { x: (start[0] + 0.5) * CELL, y: (start[1] + 0.5) * CELL },
    radius: 1.5,
    maxNodes: MAX_NODES,
  });

  const step = () => {
    growth.step();
    for (const p of growth.state.nodes) {
      if (!filled(cells, p.x, p.y) || inMargin(cells, p)) project(cells, p);
    }
  };

  const t0 = performance.now();
  for (let i = 0; i < WARMUP_STEPS && performance.now() - t0 < WARMUP_MS; i++) step();

  // The white space: a lattice over the empty cells, walked the nalee way.
  const lattice = GRID * SUB;
  const walks = naleeWalks(
    lattice,
    lattice,
    (x, y) => !cells[Math.floor(y / SUB)][Math.floor(x / SUB)],
  );
  const pitch = CELL / SUB;

  const extent = GRID * CELL;

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < STEPS_PER_FRAME; i++) step();

    const scale = Math.min(width, height) * (0.88 / extent);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate((width - extent * scale) / 2, (height - extent * scale) / 2);

    const lineWidth = growth.params.repulsionRadius * BAND * scale;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = lineWidth;

    context.strokeStyle = accent;
    context.beginPath();
    for (const walk of walks) {
      walk.forEach(([x, y], i) => {
        const px = (x + 0.5) * pitch * scale;
        const py = (y + 0.5) * pitch * scale;
        if (i === 0) context.moveTo(px, py);
        // A lone node still gets a mark: a zero-length segment with round caps.
        if (i > 0 || walk.length === 1) context.lineTo(px, py);
      });
    }
    context.stroke();

    const nodes = growth.state.nodes;
    context.strokeStyle = ink;
    context.beginPath();
    nodes.forEach((p, i) => {
      if (i === 0) context.moveTo(p.x * scale, p.y * scale);
      else context.lineTo(p.x * scale, p.y * scale);
    });
    context.closePath();
    context.stroke();

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: true,
  duration: 20000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
