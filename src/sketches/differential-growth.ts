/**
 * differential-growth — the curve let out of its window.
 *
 * terminal-ui/differential-growth only ever shows its organism through glyph
 * scopes. This is the same simulation (./terminal-ui/growth-sim: attraction,
 * repulsion, alignment, resampling) on a plain full frame, with one added
 * rule: the curve lives inside a nalee-style clipped domain — a polyomino of
 * grid cells grown at random from the centre — and any node that crosses its
 * edge is put back on the nearest point inside. The perimeter keeps growing
 * faster than the area it may occupy, so the curve buckles until it has
 * packed the domain's shape, corridors and dead ends included.
 *
 * It is drawn as one thing: a single closed band of constant width, one ink
 * on its own ground (cusphanger), the domain only as a low-contrast hairline.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { cuspPalette } from '../colors/cusphanger';
import { createGrowth, type GrowthNode } from './terminal-ui/growth-sim';

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
  const hairline = palette.tiers.low[0].css;

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

  // Outline of the domain: every cell side that faces an empty cell.
  const edges: [number, number, number, number][] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!cells[y][x]) continue;
      if (!cells[y - 1]?.[x]) edges.push([x, y, x + 1, y]);
      if (!cells[y + 1]?.[x]) edges.push([x, y + 1, x + 1, y + 1]);
      if (!cells[y][x - 1]) edges.push([x, y, x, y + 1]);
      if (!cells[y][x + 1]) edges.push([x + 1, y, x + 1, y + 1]);
    }
  }

  // Frame the domain's own bounds, not the grid it was grown on.
  let minX = GRID;
  let minY = GRID;
  let maxX = 0;
  let maxY = 0;
  for (const [x0, y0, x1, y1] of edges) {
    minX = Math.min(minX, x0, x1);
    minY = Math.min(minY, y0, y1);
    maxX = Math.max(maxX, x0, x1);
    maxY = Math.max(maxY, y0, y1);
  }
  const boundsW = (maxX - minX) * CELL;
  const boundsH = (maxY - minY) * CELL;

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < STEPS_PER_FRAME; i++) step();

    const scale = Math.min((width * 0.84) / boundsW, (height * 0.84) / boundsH);
    const ox = (width - boundsW * scale) / 2 - minX * CELL * scale;
    const oy = (height - boundsH * scale) / 2 - minY * CELL * scale;

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(ox, oy);

    context.strokeStyle = hairline;
    context.lineWidth = 1;
    context.beginPath();
    for (const [x0, y0, x1, y1] of edges) {
      context.moveTo(x0 * CELL * scale, y0 * CELL * scale);
      context.lineTo(x1 * CELL * scale, y1 * CELL * scale);
    }
    context.stroke();

    const nodes = growth.state.nodes;
    context.strokeStyle = ink;
    context.lineWidth = growth.params.repulsionRadius * BAND * scale;
    context.lineJoin = 'round';
    context.lineCap = 'round';
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
