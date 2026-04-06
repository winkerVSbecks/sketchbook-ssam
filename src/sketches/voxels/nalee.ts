import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import { randomPalette } from '../../colors';

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

const COLS = 20;
const ROWS = 20;
const WALKER_COUNT = 8;
const TILE = 24;

const bg = '#111111';
const sw = 0.4;

const palette = randomPalette();

function adjustHex(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// --- Space-filling walker simulation ---

interface Walker {
  id: number;
  path: { x: number; y: number }[]; // ordered sequence of visited cells
  x: number;
  y: number;
  preferH: boolean;
  preferFwd: boolean;
  alive: boolean;
}

function runNalee(): { walkers: Walker[]; totalWalkers: number } {
  const occupied = Array.from({ length: ROWS }, () =>
    new Array<boolean>(COLS).fill(false)
  );

  const isValid = (x: number, y: number): boolean => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
    return !occupied[y][x];
  };

  const walkers: Walker[] = [];
  let nextId = 0;

  function spawnWalker(): boolean {
    const free: { x: number; y: number }[] = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (!occupied[y][x]) free.push({ x, y });
    if (free.length === 0) return false;

    const start = free[Math.floor(Math.random() * free.length)];
    occupied[start.y][start.x] = true;
    walkers.push({
      id: nextId++,
      path: [{ x: start.x, y: start.y }],
      x: start.x,
      y: start.y,
      preferH: Math.random() < 0.5,
      preferFwd: Math.random() < 0.5,
      alive: true,
    });
    return true;
  }

  function stepWalker(w: Walker) {
    const dirs = [
      { x: w.x + 1, y: w.y },
      { x: w.x - 1, y: w.y },
      { x: w.x, y: w.y + 1 },
      { x: w.x, y: w.y - 1 },
    ];
    const axisPair = w.preferH ? [0, 1] : [2, 3];
    const [fwdIdx, bwdIdx] = w.preferFwd
      ? [axisPair[0], axisPair[1]]
      : [axisPair[1], axisPair[0]];

    let next = dirs[fwdIdx];
    if (!isValid(next.x, next.y)) {
      next = dirs[bwdIdx];
      if (!isValid(next.x, next.y)) {
        const valid = dirs.filter((d) => isValid(d.x, d.y));
        if (valid.length === 0) {
          w.alive = false;
          return;
        }
        next = valid[Math.floor(Math.random() * valid.length)];
      }
    }

    occupied[next.y][next.x] = true;
    w.x = next.x;
    w.y = next.y;
    w.path.push({ x: next.x, y: next.y });
  }

  for (let i = 0; i < WALKER_COUNT; i++) spawnWalker();

  let allFilled = false;
  while (!allFilled) {
    for (const w of walkers) {
      if (w.alive) stepWalker(w);
    }

    if (walkers.every((w) => !w.alive)) {
      if (!spawnWalker()) allFilled = true;
    }

    if (occupied.every((row) => row.every(Boolean))) {
      allFilled = true;
    }
  }

  return { walkers, totalWalkers: nextId };
}

// --- Scene building ---

function walkerStyle(id: number, _total: number) {
  const base = palette[id % palette.length];
  const top = adjustHex(base, 60);
  const shade = adjustHex(base, -60);
  return {
    default: { fill: base, stroke: bg, strokeWidth: sw },
    top: { fill: top, stroke: bg, strokeWidth: sw },
    left: { fill: shade, stroke: bg, strokeWidth: sw },
    right: { fill: shade, stroke: bg, strokeWidth: sw },
    bottom: { fill: shade, stroke: bg, strokeWidth: sw },
    front: { fill: base, stroke: bg, strokeWidth: sw },
    back: { fill: base, stroke: bg, strokeWidth: sw },
  };
}

function buildScene(): Face[] {
  const { walkers, totalWalkers } = runNalee();

  const h = new Heerich({
    tile: [TILE, TILE],
    camera: { type: 'isometric', angle: 45 },
  });

  // Deduplicate: multiple walkers could claim the same voxel position in edge cases
  const placed = new Set<string>();
  const place = (px: number, pz: number, walkerId: number) => {
    const key = `${px},${pz}`;
    if (placed.has(key)) return;
    placed.add(key);
    h.applyGeometry({
      type: 'box',
      position: [px, 0, pz],
      size: [1, 1, 1],
      style: walkerStyle(walkerId, totalWalkers),
    });
  };

  for (const walker of walkers) {
    for (let i = 0; i < walker.path.length; i++) {
      const { x, y } = walker.path[i];
      // Main cell voxel at stride-2 position
      place(x * 2, y * 2, walker.id);

      // Connector to the next cell in path sequence only —
      // parallel segments of the same walker are NOT connected,
      // so gaps appear between them (matching the 2D nalee line aesthetic)
      if (i + 1 < walker.path.length) {
        const next = walker.path[i + 1];
        const dx = next.x - x; // ±1 in one axis, 0 in other
        const dy = next.y - y;
        place(x * 2 + dx, y * 2 + dy, walker.id);
      }
    }
  }

  return h.getFaces() as Face[];
}

// --- Canvas rendering helpers (from panna-meena pattern) ---

function drawFaces(
  ctx: CanvasRenderingContext2D,
  faces: Face[],
  ox: number,
  oy: number
) {
  for (const face of faces) {
    if (face.type === 'content') continue;

    const d = face.points.data;
    ctx.beginPath();
    ctx.moveTo(d[0] + ox, d[1] + oy);
    ctx.lineTo(d[2] + ox, d[3] + oy);
    ctx.lineTo(d[4] + ox, d[5] + oy);
    ctx.lineTo(d[6] + ox, d[7] + oy);
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
      if (d[i] < minX) minX = d[i];
      if (d[i + 1] < minY) minY = d[i + 1];
      if (d[i] > maxX) maxX = d[i];
      if (d[i + 1] > maxY) maxY = d[i + 1];
    }
  }
  return { minX, minY, maxX, maxY };
}

// --- Sketch ---

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const faces = buildScene();

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const { minX, minY, maxX, maxY } = sceneBounds(faces);
    const ox = (width - (maxX - minX)) / 2 - minX;
    const oy = (height - (maxY - minY)) / 2 - minY;

    drawFaces(context, faces, ox, oy);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
