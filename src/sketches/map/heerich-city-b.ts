import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { oklch } from 'culori';
import { randomPalette } from '../../colors';
import { mapMaker } from './algorithm';
import type { Street } from './algorithm';

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

interface Block {
  id: number;
  cells: [number, number][];
  height: number;
  color: string;
}

const config = {
  grid: 80, // heerich cells along each side of the plan
  cellPx: 8, // plan pixels per cell, so the map grows on a 640px square
  minDistance: 50,
  maxDistance: 110,
  minHeight: 2,
  maxHeight: 26,
  setback: 3, // storeys gained per ring of cells in from the street
  tile: 10,
  sw: 0.35,
};

// The lightest colour is the paper the city stands on; the rest are building inks.
const palette = [...randomPalette()].sort((a, b) => (oklch(b)?.l ?? 0) - (oklch(a)?.l ?? 0));
const bg = palette.shift()!;
const inks = palette;

const lighten = (c: string, d: number) => `oklch(from ${c} calc(l + ${d}) c h)`;
const darken = (c: string, d: number) => `oklch(from ${c} calc(l - ${d}) c h)`;

// Grow map-maker's street network to a standstill: every street stopped and the
// parallel-street cleanup has nothing left to remove.
function growPlan(): Street[] {
  const size = config.grid * config.cellPx;
  const grow = mapMaker([size, size], [0, 0], {
    minDistance: config.minDistance,
    maxDistance: config.maxDistance,
    step: 5,
    jitter: false,
  });

  let streets: Street[] = [];
  let still = 0;
  for (let i = 0; i < 4000 && still < 2; i++) {
    streets = grow();
    const stopped = streets.every(
      (s) => s.forwardState === 'stopped' && s.backwardState === 'stopped',
    );
    still = stopped ? still + 1 : 0;
  }
  return streets;
}

// Mark the 2×2 cells around every sample along a street, so each street is two
// cells wide. Sampling at a quarter cell keeps the barrier 4-connected, so the
// flood fill below cannot leak across a diagonal.
function rasterise(streets: Street[]): boolean[][] {
  const { grid, cellPx } = config;
  const road = Array.from({ length: grid }, () => Array<boolean>(grid).fill(false));
  const half = cellPx / 2;
  const mark = (x: number, y: number) => {
    for (const ox of [-half, half]) {
      for (const oy of [-half, half]) {
        const cx = Math.floor((x + ox) / cellPx);
        const cy = Math.floor((y + oy) / cellPx);
        if (cx >= 0 && cy >= 0 && cx < grid && cy < grid) road[cy][cx] = true;
      }
    }
  };

  for (const { points } of streets) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const n = Math.ceil((Math.hypot(x1 - x0, y1 - y0) / cellPx) * 4) + 1;
      for (let k = 0; k <= n; k++) mark(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    }
  }

  // A ring road round the plan, so blocks cut by its edge step back like the rest.
  for (let i = 0; i < grid; i++) {
    for (const j of [0, 1, grid - 2, grid - 1]) {
      road[i][j] = true;
      road[j][i] = true;
    }
  }
  return road;
}

// Label the 4-connected regions between streets. Each region is a city block.
function findBlocks(road: boolean[][]): { blocks: Block[]; ring: number[][] } {
  const { grid } = config;
  const label = Array.from({ length: grid }, () => Array<number>(grid).fill(-1));
  const blocks: Block[] = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (road[y][x] || label[y][x] !== -1) continue;
      const id = blocks.length;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      label[y][x] = id;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        cells.push([cx, cy]);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
          if (road[ny][nx] || label[ny][nx] !== -1) continue;
          label[ny][nx] = id;
          stack.push([nx, ny]);
        }
      }
      blocks.push({ id, cells, height: 0, color: Random.pick(inks) });
    }
  }

  // Ring index of each cell: 1 on the kerb, growing inward (BFS from the streets).
  const ring = Array.from({ length: grid }, () => Array<number>(grid).fill(0));
  let frontier: [number, number][] = [];
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      if (road[y][x]) continue;
      const kerb = dirs.some(([dx, dy]) => road[y + dy]?.[x + dx]);
      if (kerb) {
        ring[y][x] = 1;
        frontier.push([x, y]);
      }
    }
  }
  for (let r = 2; frontier.length; r++) {
    const next: [number, number][] = [];
    for (const [x, y] of frontier) {
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
        if (road[ny][nx] || ring[ny][nx]) continue;
        ring[ny][nx] = r;
        next.push([nx, ny]);
      }
    }
    frontier = next;
  }

  // Height from area: the larger the block, the taller its crown.
  const areas = blocks.map((b) => Math.sqrt(b.cells.length));
  const lo = Math.min(...areas);
  const hi = Math.max(...areas);
  blocks.forEach((b, i) => {
    b.height = Math.round(
      mapRange(areas[i], lo, hi, config.minHeight, config.maxHeight, true),
    );
  });

  return { blocks, ring };
}

function faceStyle(base: string) {
  const top = lighten(base, 0.12);
  const front = base;
  const side = darken(base, 0.14);
  const edge = (fill: string) => ({ fill, stroke: darken(fill, 0.06), strokeWidth: config.sw });
  return {
    default: edge(front),
    top: edge(top),
    front: edge(front),
    back: edge(front),
    left: edge(side),
    right: edge(side),
    bottom: edge(side),
  };
}

function buildScene(blocks: Block[], ring: number[][]): Face[] {
  const { grid, maxHeight, setback } = config;
  const h = new Heerich({
    tile: [config.tile, config.tile],
    camera: { type: 'isometric', angle: 45 },
  });

  // y grows downward in heerich: the ground slab sits at y = ground and
  // buildings stack upward into smaller y.
  const ground = maxHeight + 1;
  const street = darken(bg, 0.16);
  h.applyGeometry({
    type: 'box',
    position: [0, ground, 0],
    size: [grid, 1, grid],
    style: {
      default: { fill: darken(bg, 0.3), stroke: darken(bg, 0.3), strokeWidth: config.sw },
      top: { fill: street, stroke: street, strokeWidth: config.sw },
    },
  });

  for (const block of blocks) {
    const style = faceStyle(block.color);
    for (const [x, z] of block.cells) {
      // Step the mass back from the street: each ring in adds `setback` storeys
      // until the block's own height caps it.
      const tall = Math.min(block.height, ring[z][x] * setback);
      if (tall <= 0) continue;
      h.applyGeometry({
        type: 'box',
        position: [x, ground - tall, z],
        size: [1, tall, 1],
        style,
      });
    }
  }

  return h.getFaces() as Face[];
}

function drawFaces(ctx: CanvasRenderingContext2D, faces: Face[]) {
  for (const face of faces) {
    if (face.type === 'content') continue;
    const d = face.points.data;
    ctx.beginPath();
    ctx.moveTo(d[0], d[1]);
    for (let i = 2; i < d.length; i += 2) ctx.lineTo(d[i], d[i + 1]);
    ctx.closePath();
    if (face.style.fill) {
      ctx.fillStyle = face.style.fill;
      ctx.fill();
    }
    if (face.style.stroke) {
      ctx.strokeStyle = face.style.stroke;
      ctx.lineWidth = face.style.strokeWidth ?? 1;
      ctx.stroke();
    }
  }
}

function sceneBounds(faces: Face[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const face of faces) {
    if (face.type === 'content') continue;
    const d = face.points.data;
    for (let i = 0; i < d.length; i += 2) {
      minX = Math.min(minX, d[i]);
      maxX = Math.max(maxX, d[i]);
      minY = Math.min(minY, d[i + 1]);
      maxY = Math.max(maxY, d[i + 1]);
    }
  }
  return { minX, minY, maxX, maxY };
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const { blocks, ring } = findBlocks(rasterise(growPlan()));
  const faces = buildScene(blocks, ring);
  const { minX, minY, maxX, maxY } = sceneBounds(faces);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const margin = 0.08;
    const scale = Math.min(
      (width * (1 - 2 * margin)) / (maxX - minX),
      (height * (1 - 2 * margin)) / (maxY - minY),
    );
    context.save();
    context.translate(width / 2, height / 2);
    context.scale(scale, scale);
    context.translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
    drawFaces(context, faces);
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
