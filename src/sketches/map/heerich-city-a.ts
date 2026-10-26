import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { cuspPalette } from '../../colors/cusphanger';
import { mapMaker, type Street } from './algorithm';

/**
 * map/basic's street network, grown on a square plan, is rasterised onto a
 * G×G voxel grid. Every 4-connected run of non-street cells is a block, and
 * each block is extruded as high as the side of the square with its area
 * (h = round(√area)). Over the loop the city extrudes one storey per step and
 * every block stops at its own height, then sinks back to the flat plan.
 */

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

interface Block {
  cells: number[];
  height: number;
}

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

const config = {
  grid: 80,
  // plan units per grid cell — the street algorithm runs in these units
  cell: 10,
  minDistance: 70,
  maxDistance: 140,
  // street half-width in cells: 0.5 paves a two-cell road
  streetWidth: 0.5,
  heightScale: 1,
  tile: 12,
};

const palette = cuspPalette({ count: 1, ground: 'light' });
const bg = palette.bg.css;
const street = `oklch(from ${bg} calc(l - 0.1) c h)`;
const [roof] = palette.tiers.low.map((s) => s.css);
const [sideA] = palette.tiers.mid.map((s) => s.css);
const [sideB] = palette.tiers.high.map((s) => s.css);

const solid = (fill: string) => ({ fill, stroke: fill, strokeWidth: 0.5 });

const buildingStyle = {
  default: solid(sideA),
  top: solid(roof),
  bottom: solid(sideB),
  front: solid(sideA),
  back: solid(sideA),
  left: solid(sideB),
  right: solid(sideB),
};

const groundStyle = {
  default: solid(sideA),
  top: solid(street),
  bottom: solid(sideB),
  front: solid(sideA),
  back: solid(sideA),
  left: solid(sideB),
  right: solid(sideB),
};

// Grow map/basic's streets to rest. The closure only stops changing once every
// street has stopped and the parallel-street cleanup removed nothing.
function growStreets(size: number): Street[] {
  const grow = mapMaker([size, size], [0, 0], {
    minDistance: config.minDistance,
    maxDistance: config.maxDistance,
    step: config.cell / 2,
  });
  let streets: Street[] = [];
  let restingFor = 0;
  for (let i = 0; i < 2000 && restingFor < 2; i++) {
    streets = grow();
    const resting = streets.every(
      (s) => s.forwardState === 'stopped' && s.backwardState === 'stopped',
    );
    restingFor = resting ? restingFor + 1 : 0;
  }
  return streets;
}

// Pave every cell within streetWidth of a street, sampled at a quarter cell,
// plus a perimeter road so every block is closed.
function rasterise(streets: Street[], g: number): Uint8Array {
  const road = new Uint8Array(g * g);
  const r = config.streetWidth * config.cell;
  const mark = (x: number, y: number) => {
    const x0 = Math.max(0, Math.floor((x - r) / config.cell));
    const x1 = Math.min(g - 1, Math.floor((x + r) / config.cell));
    const y0 = Math.max(0, Math.floor((y - r) / config.cell));
    const y1 = Math.min(g - 1, Math.floor((y + r) / config.cell));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) road[cy * g + cx] = 1;
  };
  for (const s of streets) {
    for (let i = 0; i < s.points.length - 1; i++) {
      const [x0, y0] = s.points[i];
      const [x1, y1] = s.points[i + 1];
      const n = Math.ceil((Math.hypot(x1 - x0, y1 - y0) / config.cell) * 4) + 1;
      for (let k = 0; k <= n; k++) mark(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    }
  }
  for (let i = 0; i < g; i++) {
    road[i] = road[(g - 1) * g + i] = road[i * g] = road[i * g + g - 1] = 1;
  }
  return road;
}

// 4-connected flood fill of the non-street cells into blocks.
function findBlocks(road: Uint8Array, g: number): Block[] {
  const seen = new Uint8Array(g * g);
  const blocks: Block[] = [];
  for (let start = 0; start < g * g; start++) {
    if (road[start] || seen[start]) continue;
    const cells: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const x = c % g;
      const y = (c / g) | 0;
      const next = [
        x > 0 ? c - 1 : -1,
        x < g - 1 ? c + 1 : -1,
        y > 0 ? c - g : -1,
        y < g - 1 ? c + g : -1,
      ];
      for (const n of next) {
        if (n < 0 || road[n] || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    blocks.push({ cells, height: Math.max(1, Math.round(Math.sqrt(cells.length) * config.heightScale)) });
  }
  return blocks;
}

// Heerich's y runs downward: the ground slab sits at y = 0, buildings rise into negative y.
function buildScene(heightMap: Int16Array, g: number, level: number): Face[] {
  const h = new Heerich({
    tile: [config.tile, config.tile],
    camera: { type: 'isometric', angle: 45 },
  });
  h.applyGeometry({ type: 'box', position: [0, 0, 0], size: [g, 2, g], style: groundStyle });
  for (let c = 0; c < g * g; c++) {
    const top = Math.min(heightMap[c], level);
    if (top <= 0) continue;
    h.applyGeometry({
      type: 'box',
      position: [c % g, -top, (c / g) | 0],
      size: [1, top, 1],
      style: buildingStyle,
    });
  }
  return h.getFaces() as unknown as Face[];
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
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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

  const g = config.grid;
  const streets = growStreets(g * config.cell);
  const road = rasterise(streets, g);
  const blocks = findBlocks(road, g);

  const heightMap = new Int16Array(g * g);
  for (const b of blocks) for (const c of b.cells) heightMap[c] = b.height;
  const maxLevel = Math.max(...blocks.map((b) => b.height));

  // One scene per storey of the extrusion; the full city fixes the framing.
  const scenes = new Map<number, Face[]>();
  const sceneAt = (level: number) => {
    if (!scenes.has(level)) scenes.set(level, buildScene(heightMap, g, level));
    return scenes.get(level)!;
  };
  const frame = sceneBounds(sceneAt(maxLevel));

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Full city at the loop's start and end; at its middle every block is one
    // storey, the plan as footprints.
    const rise = 0.5 + 0.5 * Math.cos(playhead * Math.PI * 2);
    const level = 1 + Math.round(rise * (maxLevel - 1));

    const bw = frame.maxX - frame.minX;
    const bh = frame.maxY - frame.minY;
    const scale = Math.min((width * 0.88) / bw, (height * 0.88) / bh);

    context.save();
    context.translate(width / 2, height / 2);
    context.scale(scale, scale);
    context.translate(-(frame.minX + bw / 2), -(frame.minY + bh / 2));
    drawFaces(context, sceneAt(level));
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  attributes: { colorSpace: 'display-p3' },
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
