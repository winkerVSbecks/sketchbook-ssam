import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { converter, formatHex, interpolate } from 'culori';
import { mapMaker, type Street } from './algorithm';
import { clrs } from '../../colors/clrs';
import { palettes as aaPalettes } from '../../colors/auto-albers';
import { palettes as mPalettes } from '../../colors/mindful-palettes';

/**
 * heerich-city — map/basic's street network extruded into an isometric city.
 *
 * map-maker grows streets from Poisson-disc seeds until every one has run
 * into another (or off the plan). The finished network is rasterised onto a
 * `grid`² cell plan: every cell a street passes through is road, and what is
 * left falls apart into blocks (4-connected flood fill). Each block becomes
 * one heerich mass whose height comes from its area alone — the larger the
 * block, the taller it stands — so the plan decides the skyline. Roads stay a
 * single voxel thick; block tops darken with height.
 */

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

type FaceStyle = { fill: string; stroke: string; strokeWidth: number };

interface Block {
  cells: [number, number][];
  height: number;
}

const config = {
  plan: 1080,
  grid: 64,
  minDistance: 110,
  maxDistance: 220,
  maxHeight: 14,
  angle: 45,
  sw: 0.8,
};

// Roles from lightness: lightest = ground, darkest = ink; tops step from
// near-ground toward ink as blocks rise.
const toOklch = converter('oklch');
const byL = [...(Random.pick([...clrs, ...aaPalettes, ...mPalettes]) as string[])].sort(
  (a, b) => (toOklch(a)?.l ?? 0) - (toOklch(b)?.l ?? 0),
);
const ink = byL[0];
const ground = byL[byL.length - 1];
const mixGI = interpolate([ground, ink], 'oklch');
const colors = {
  bg: ground,
  road: formatHex(mixGI(0.06)),
  face: formatHex(mixGI(0.62)),
  shade: ink,
};
const roofAt = (t: number) => formatHex(mixGI(0.2 + t * 0.35));

// Run map-maker until the network stops changing: every street has stopped,
// and stays stopped through the following clean-up pass.
function growStreets(): Street[] {
  const step = mapMaker([config.plan, config.plan], [0, 0], {
    minDistance: config.minDistance,
    maxDistance: config.maxDistance,
    step: 3,
  });
  const stopped = (s: Street[]) =>
    s.every((st) => st.forwardState === 'stopped' && st.backwardState === 'stopped');
  let streets = step();
  let calm = 0;
  for (let i = 0; i < 4000 && calm < 2; i++) {
    streets = step();
    calm = stopped(streets) ? calm + 1 : 0;
  }
  return streets;
}

function rasterise(streets: Street[]): boolean[][] {
  const n = config.grid;
  const cs = config.plan / n;
  const road = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const mark = (x: number, y: number) => {
    const [c, r] = [Math.floor(x / cs), Math.floor(y / cs)];
    if (r >= 0 && r < n && c >= 0 && c < n) road[r][c] = true;
  };
  for (const s of streets) {
    for (let i = 1; i < s.points.length; i++) {
      const [x0, y0] = s.points[i - 1];
      const [x1, y1] = s.points[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cs / 3)));
      for (let k = 0; k <= steps; k++) mark(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps);
    }
  }
  return road;
}

function findBlocks(road: boolean[][]): Block[] {
  const n = config.grid;
  const seen = road.map((row) => row.slice());
  const blocks: Block[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (seen[r][c]) continue;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [y, x] = stack.pop()!;
        cells.push([y, x]);
        for (const [dy, dx] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const [ny, nx] = [y + dy, x + dx];
          if (ny >= 0 && ny < n && nx >= 0 && nx < n && !seen[ny][nx]) {
            seen[ny][nx] = true;
            stack.push([ny, nx]);
          }
        }
      }
      blocks.push({ cells, height: 0 });
    }
  }
  // Height from area on a square-root scale, so a block's height tracks its side.
  const sides = blocks.map((b) => Math.sqrt(b.cells.length));
  const [lo, hi] = [Math.min(...sides), Math.max(...sides)];
  blocks.forEach((b, i) => {
    b.height = Math.max(1, Math.round(mapRange(sides[i], lo, hi, 1, config.maxHeight, true)));
  });
  return blocks;
}

// Each face is stroked in its own fill: the voxel seams close up and a block
// reads as one mass, its form carried by the three face values alone.
const flat = (fill: string): FaceStyle => ({ fill, stroke: fill, strokeWidth: config.sw });
const styleFor = (top: string): Record<string, FaceStyle> => ({
  default: flat(colors.face),
  front: flat(colors.face),
  back: flat(colors.face),
  top: flat(top),
  left: flat(colors.shade),
  right: flat(colors.shade),
  bottom: flat(colors.shade),
});

function buildScene(road: boolean[][], blocks: Block[], tile: number): Face[] {
  const h = new Heerich({ tile: [tile, tile], camera: { type: 'isometric', angle: config.angle } });
  const roadStyle = styleFor(colors.road);
  const roofs = Array.from({ length: config.maxHeight + 1 }, (_, i) =>
    styleFor(roofAt(i / config.maxHeight)),
  );

  // Isometric heerich stands y up: the plan lies in x–z, height on −y.
  road.forEach((row, z) =>
    row.forEach((isRoad, x) => {
      if (isRoad) h.applyGeometry({ type: 'box', position: [x, 0, z], size: [1, 1, 1], style: roadStyle });
    }),
  );
  for (const b of blocks) {
    const ht = b.height + 1;
    for (const [z, x] of b.cells) {
      h.applyGeometry({
        type: 'box',
        position: [x, -(ht - 1), z],
        size: [1, ht, 1],
        style: roofs[b.height],
      });
    }
  }
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

  const road = rasterise(growStreets());
  const blocks = findBlocks(road);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);

    // Measure at a unit tile, then rebuild at the tile that fits 88% of the canvas.
    const probe = sceneBounds(buildScene(road, blocks, 10));
    const fit = Math.min(
      (width * 0.88) / (probe.maxX - probe.minX),
      (height * 0.88) / (probe.maxY - probe.minY),
    );
    const faces = buildScene(road, blocks, 10 * fit);
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
