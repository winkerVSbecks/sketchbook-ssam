import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { cuspPalette } from '../../colors/cusphanger';
import { mapMaker } from './algorithm';
import type { Street } from './algorithm';

/**
 * map/basic's street network, grown to rest in plan space, rasterised onto a
 * heerich voxel grid. Every 4-connected region of non-street cells is a block;
 * each block rises to the side of the square with its area (h ∝ √area), so the
 * plan's own measure becomes its elevation.
 */

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

const config = {
  // plan space the streets grow in, at map/basic's own street spacing
  // (a 640 crop of its 1080 plan keeps blocks several voxels deep)
  plan: 640,
  // voxel grid resolution across the plan
  grid: 72,
  // height = round(√area × heightScale): below 1 so the streets stay in view
  heightScale: 0.75,
  // blocks smaller than this stay at street level as open lots
  minBlock: 4,
  tile: 10,
  sw: 0.4,
  margin: 0.06,
};

const palette = cuspPalette({ count: 3 });
const bg = palette.bg.css;

// heerich's isometric camera at 45° shows each voxel's top, front and left faces.
type Tones = { top: string; front: string; left: string };

// Per hue, the three tiers sorted light → dark so the light falls the same
// way on a light or a dark ground: top lightest, left darkest.
const tones: Tones[] = palette.hues.map((_, i) => {
  const [top, front, left] = [palette.tiers.low[i], palette.tiers.mid[i], palette.tiers.high[i]]
    .sort((a, b) => b.color.l - a.color.l)
    .map((s) => s.css);
  return { top, front, left };
});
// the slab's edge: the faintest tier, barely off the ground
const edge = palette.tiers.low[Math.max(0, palette.baseIndex)].css;

type Block = { id: number; cells: number[]; area: number; height: number };

/** Grow map/basic's streets until no street is still growing for a few frames. */
function growStreets(size: number): Street[] {
  const system = mapMaker([size, size], [0, 0], {
    minDistance: 50,
    maxDistance: 100,
    step: 2,
    jitter: false,
  });
  let streets: Street[] = [];
  let still = 0;
  for (let i = 0; i < 4000 && still < 4; i++) {
    streets = system();
    const stopped = streets.every(
      (s) => s.forwardState === 'stopped' && s.backwardState === 'stopped',
    );
    still = stopped ? still + 1 : 0;
  }
  return streets;
}

/**
 * Supercover-style rasterisation: sample every street segment finely and mark
 * each cell it passes through, so the street cells always separate blocks
 * under 4-connectivity. The plan's perimeter is a street too.
 */
function rasterise(streets: Street[], n: number, size: number): Uint8Array {
  const road = new Uint8Array(n * n);
  const cell = size / n;
  const mark = (x: number, y: number) => {
    const i = Math.floor(x / cell);
    const j = Math.floor(y / cell);
    if (i >= 0 && i < n && j >= 0 && j < n) road[j * n + i] = 1;
  };
  for (const { points } of streets) {
    for (let k = 0; k < points.length - 1; k++) {
      const [x0, y0] = points[k];
      const [x1, y1] = points[k + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (cell * 0.1)) || 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        mark(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      }
    }
  }
  for (let k = 0; k < n; k++) {
    road[k] = road[(n - 1) * n + k] = road[k * n] = road[k * n + n - 1] = 1;
  }
  return road;
}

/** 4-connected flood fill of the non-street cells into blocks. */
function findBlocks(road: Uint8Array, n: number): Block[] {
  const label = new Int32Array(n * n).fill(-1);
  const blocks: Block[] = [];
  for (let start = 0; start < n * n; start++) {
    if (road[start] || label[start] !== -1) continue;
    const id = blocks.length;
    const cells: number[] = [];
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const x = c % n;
      const y = (c - x) / n;
      const next = [
        x > 0 ? c - 1 : -1,
        x < n - 1 ? c + 1 : -1,
        y > 0 ? c - n : -1,
        y < n - 1 ? c + n : -1,
      ];
      for (const m of next) {
        if (m < 0 || road[m] || label[m] !== -1) continue;
        label[m] = id;
        stack.push(m);
      }
    }
    const area = cells.length;
    blocks.push({
      id,
      cells,
      area,
      height: area < config.minBlock ? 0 : Math.max(1, Math.round(Math.sqrt(area) * config.heightScale)),
    });
  }
  return blocks;
}

const faceStyle = (fill: string): StyleObject => ({ fill, stroke: bg, strokeWidth: config.sw });

type FaceStyles = Record<'default' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back', StyleObject>;

function styleFor({ top, front, left }: Tones): FaceStyles {
  return {
    default: faceStyle(front),
    top: faceStyle(top),
    bottom: faceStyle(left),
    left: faceStyle(left),
    right: faceStyle(left),
    front: faceStyle(front),
    back: faceStyle(front),
  };
}

function buildCity(): Face[] {
  const n = config.grid;
  const streets = growStreets(config.plan);
  const road = rasterise(streets, n, config.plan);
  const blocks = findBlocks(road, n);

  // Hue follows the block's area tercile among the standing blocks.
  const standing = blocks.filter((b) => b.height > 0).sort((a, b) => a.area - b.area);
  const tercile = new Map<number, number>();
  standing.forEach((b, i) => tercile.set(b.id, Math.floor((i / standing.length) * tones.length)));

  const h = new Heerich({
    tile: [config.tile, config.tile],
    camera: { type: 'isometric', angle: 45 },
  });
  const half = n / 2;
  const ground = styleFor({ top: bg, front: edge, left: edge });

  // The plan itself: one slab, streets and open lots at ground colour.
  h.applyGeometry({
    type: 'box',
    position: [-half, 0, -half],
    size: [n, 1, n],
    style: ground,
  });

  for (const block of standing) {
    const style = styleFor(tones[tercile.get(block.id) ?? 0]);
    for (const c of block.cells) {
      const x = c % n;
      const z = (c - x) / n;
      // y grows downward in heerich: the block stands on the slab at y = 0
      h.applyGeometry({
        type: 'box',
        position: [x - half, -block.height, z - half],
        size: [1, block.height, 1],
        style,
      });
    }
  }

  return h.getFaces();
}

function bounds(faces: Face[]) {
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

function drawFaces(ctx: CanvasRenderingContext2D, faces: Face[]) {
  for (const face of faces) {
    if (face.type === 'content') continue;
    const d = face.points.data;
    ctx.beginPath();
    ctx.moveTo(d[0], d[1]);
    for (let i = 2; i < d.length; i += 2) ctx.lineTo(d[i], d[i + 1]);
    ctx.closePath();
    if (face.style?.fill) {
      ctx.fillStyle = face.style.fill;
      ctx.fill();
    }
    if (face.style?.stroke) {
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
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  const faces = buildCity();
  const box = bounds(faces);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const m = width * config.margin;
    const bw = box.maxX - box.minX;
    const bh = box.maxY - box.minY;
    const scale = Math.min((width - 2 * m) / bw, (height - 2 * m) / bh);

    context.save();
    context.translate(width / 2, height / 2);
    context.scale(scale, scale);
    context.translate(-(box.minX + bw / 2), -(box.minY + bh / 2));
    context.lineJoin = 'round';
    drawFaces(context, faces);
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);
