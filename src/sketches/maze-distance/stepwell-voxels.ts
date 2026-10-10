import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { converter, formatHex, interpolate } from 'culori';
import { clrs } from '../../colors/clrs';
import { palettes as aaPalettes } from '../../colors/auto-albers';
import { palettes as mPalettes } from '../../colors/mindful-palettes';

/**
 * stepwell-voxels — the maze-distance BFS field given height.
 *
 * A sidewinder maze (as in maze-distance/basic) is solved breadth-first from a
 * cell on one edge. The distance is cut into `bands`; each band is one
 * terrace, highest at the start and stepping down a level per band, so the
 * maze descends like a stepwell. The maze is laid on a (2n+1)² voxel grid:
 * odd/odd voxels are cells, odd/even ones are the passage or wall between two
 * cells, even/even ones are posts. A passage takes the lower of its two cells
 * (a step where bands meet); a wall stands one voxel proud of its higher
 * neighbour. The solved path from start to the farthest cell is carved one
 * voxel lower again — a sunken stair running down through the terraces.
 */

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

interface MazeCell {
  row: number;
  col: number;
  links: Set<MazeCell>;
}

type FaceStyle = { fill: string; stroke: string; strokeWidth: number };

// Roles come from lightness, not order: the lightest palette colour is the
// ground, the darkest the shadow, the most chromatic of the rest the carved
// path. Terrace tops step from near-ground down toward the ink, one tint per
// band, so depth reads as both height and value.
const toOklch = converter('oklch');
const byL = [...(Random.pick([...clrs, ...aaPalettes, ...mPalettes]) as string[])].sort(
  (a, b) => (toOklch(a)?.l ?? 0) - (toOklch(b)?.l ?? 0),
);
const ink = byL[0];
const ground = byL[byL.length - 1];
const rest = byL.slice(1, -1);
const vivid = [...rest].sort((a, b) => (toOklch(b)?.c ?? 0) - (toOklch(a)?.c ?? 0))[0];
// A grey palette has no accent to spare: the stair is then cut in ink.
const accent = vivid && (toOklch(vivid)?.c ?? 0) > 0.04 ? vivid : ink;
const mixGI = interpolate([ground, ink], 'oklch');

const config = {
  size: 14,
  bands: 6,
  wall: 1,
  carve: 1,
  angle: 45,
  sw: 0.6,
  bg: ground,
  face: formatHex(mixGI(0.55)),
  shade: ink,
  wallTop: formatHex(mixGI(0.08)),
  path: accent,
};

// Rim band = 0.18 of the way to ink, deepest band = 0.5.
const terrace = (t: number) => formatHex(mixGI(0.18 + t * 0.32));

// Sidewinder: each row runs east; a run closes at random (or at the east
// edge) by linking one of its cells north. The top row is one long corridor.
function sidewinder(n: number): MazeCell[][] {
  const grid = Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col): MazeCell => ({ row, col, links: new Set() })),
  );
  const link = (a: MazeCell, b: MazeCell) => {
    a.links.add(b);
    b.links.add(a);
  };
  for (const row of grid) {
    let run: MazeCell[] = [];
    for (const c of row) {
      run.push(c);
      const atEast = c.col === n - 1;
      const atNorth = c.row === 0;
      if (atEast || (!atNorth && Random.rangeFloor(0, 2) === 0)) {
        if (!atNorth) {
          const c2 = Random.pick(run) as MazeCell;
          link(c2, grid[c2.row - 1][c2.col]);
        }
        run = [];
      } else {
        link(c, row[c.col + 1]);
      }
    }
  }
  return grid;
}

function distances(grid: MazeCell[][], start: MazeCell): number[][] {
  const d = grid.map((row) => row.map(() => Infinity));
  d[start.row][start.col] = 0;
  const queue = [start];
  while (queue.length) {
    const c = queue.shift()!;
    for (const l of c.links) {
      if (d[l.row][l.col] === Infinity) {
        d[l.row][l.col] = d[c.row][c.col] + 1;
        queue.push(l);
      }
    }
  }
  return d;
}

// Walk back from `end` along strictly decreasing distance to the start.
function solve(grid: MazeCell[][], d: number[][], end: MazeCell): MazeCell[] {
  const path = [end];
  let c = end;
  while (d[c.row][c.col] > 0) {
    c = [...c.links].find((l) => d[l.row][l.col] === d[c.row][c.col] - 1)!;
    path.push(c);
  }
  return path.reverse();
}

type VoxelKind = 'floor' | 'wall' | 'path';

interface Voxel {
  h: number;
  kind: VoxelKind;
  band: number;
}

function buildHeights(): Voxel[][] {
  const n = config.size;
  const grid = sidewinder(n);
  // Start on a random edge cell; the far end is wherever BFS reaches last.
  const side = Random.rangeFloor(0, 4);
  const k = Random.rangeFloor(0, n);
  const [sr, sc] = [
    [0, k],
    [n - 1, k],
    [k, 0],
    [k, n - 1],
  ][side];
  const start = grid[sr][sc];
  const d = distances(grid, start);
  const dMax = Math.max(...d.flat());
  let end = start;
  for (const row of grid) for (const c of row) if (d[c.row][c.col] === dMax) end = c;

  const band = (dist: number) =>
    Math.min(config.bands - 1, Math.floor(mapRange(dist, 0, dMax + 1, 0, config.bands)));
  // Terrace height: the start's band is the rim, every band one voxel lower.
  const floorH = (c: MazeCell) => 1 + config.carve + (config.bands - 1 - band(d[c.row][c.col]));

  const onPath = new Set(solve(grid, d, end));
  const res = 2 * n + 1;
  const vox: Voxel[][] = Array.from({ length: res }, () =>
    Array.from({ length: res }, (): Voxel => ({ h: 0, kind: 'wall', band: 0 })),
  );

  for (const row of grid) {
    for (const c of row) {
      const [x, y] = [2 * c.col + 1, 2 * c.row + 1];
      const p = onPath.has(c);
      const b = band(d[c.row][c.col]);
      vox[y][x] = { h: floorH(c) - (p ? config.carve : 0), kind: p ? 'path' : 'floor', band: b };

      // East and south edges (the north/west ones belong to the neighbour).
      const nbrs: [MazeCell | undefined, number, number][] = [
        [row[c.col + 1], x + 1, y],
        [grid[c.row + 1]?.[c.col], x, y + 1],
      ];
      for (const [o, ex, ey] of nbrs) {
        if (!o) continue;
        if (c.links.has(o)) {
          const both = p && onPath.has(o);
          vox[ey][ex] = {
            h: Math.min(floorH(c), floorH(o)) - (both ? config.carve : 0),
            kind: both ? 'path' : 'floor',
            band: Math.max(b, band(d[o.row][o.col])),
          };
        } else {
          vox[ey][ex] = { h: Math.max(floorH(c), floorH(o)) + config.wall, kind: 'wall', band: b };
        }
      }
    }
  }

  // Outer rim: walls as tall as the cell they enclose.
  for (let i = 1; i < res; i += 2) {
    const rim: [number, number, number, number][] = [
      [0, i, 1, i],
      [res - 1, i, res - 2, i],
      [i, 0, i, 1],
      [i, res - 1, i, res - 2],
    ];
    for (const [x, y, cx, cy] of rim) {
      vox[y][x] = { h: vox[cy][cx].h + config.wall + config.carve, kind: 'wall', band: 0 };
    }
  }

  // Posts: as tall as the tallest edge touching them.
  for (let y = 0; y < res; y += 2) {
    for (let x = 0; x < res; x += 2) {
      const around = [vox[y - 1]?.[x], vox[y + 1]?.[x], vox[y]?.[x - 1], vox[y]?.[x + 1]];
      vox[y][x] = { h: Math.max(...around.map((v) => v?.h ?? 0)), kind: 'wall', band: 0 };
    }
  }
  return vox;
}

function buildScene(vox: Voxel[][], tile: number): Face[] {
  const h = new Heerich({
    tile: [tile, tile],
    camera: { type: 'isometric', angle: config.angle },
  });
  const ss = { stroke: config.bg, strokeWidth: config.sw };
  const styleFor = (topFill: string): Record<string, FaceStyle> => ({
    default: { fill: config.face, ...ss },
    front: { fill: config.face, ...ss },
    back: { fill: config.face, ...ss },
    top: { fill: topFill, ...ss },
    left: { fill: config.shade, ...ss },
    right: { fill: config.shade, ...ss },
    bottom: { fill: config.shade, ...ss },
  });
  const floors = Array.from({ length: config.bands }, (_, b) =>
    styleFor(terrace(b / Math.max(1, config.bands - 1))),
  );
  const walls = styleFor(config.wallTop);
  const carved = styleFor(config.path);
  const styleOf = (v: Voxel) =>
    v.kind === 'path' ? carved : v.kind === 'wall' ? walls : floors[v.band];

  vox.forEach((row, y) =>
    row.forEach((v, x) => {
      h.applyGeometry({
        type: 'box',
        // Isometric heerich stands y up: the plan lies in x–z, height on −y.
        position: [x, -(v.h - 1), y],
        size: [1, v.h, 1],
        style: styleOf(v),
      });
    }),
  );
  return h.getFaces() as Face[];
}

function sceneBounds(faces: Face[]) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
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

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const vox = buildHeights();

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    // Project once at unit tile size to measure, then rebuild at the tile
    // that fits the scene to 86% of the canvas (strokes stay a fixed width).
    const probe = sceneBounds(buildScene(vox, 10));
    const fit = Math.min(
      (width * 0.86) / (probe.maxX - probe.minX),
      (height * 0.86) / (probe.maxY - probe.minY),
    );
    const faces = buildScene(vox, 10 * fit);
    const { minX, minY, maxX, maxY } = sceneBounds(faces);

    context.save();
    context.translate((width - (maxX - minX)) / 2 - minX, (height - (maxY - minY)) / 2 - minY);
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
