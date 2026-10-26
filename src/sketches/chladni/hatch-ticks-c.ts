import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clamp } from 'canvas-sketch-util/math';

// Chladni plate drawn the way electric-field/hatch-field draws a charge field:
// evenly spaced gradient lines carry short cross ticks whose length follows the
// plate's amplitude, so the nodal lines (amplitude 0) read as white gaps.

interface Point {
  x: number;
  y: number;
}

interface Tick {
  x: number;
  y: number;
  angle: number;
  len: number;
  weight: number;
}

interface Mode {
  m: number;
  n: number;
  a: number;
  b: number;
}

const config = {
  seed: Random.getRandomSeed(),
  margin: 72,
  // streamline placement (Jobard–Lefer style)
  lineSep: 10,
  lineTest: 5,
  step: 1.5,
  maxSteps: 1400,
  minGrad: 0.04,
  // ticks
  tickSpacing: 5,
  tickSpacingJitter: 1.5,
  tickLenMin: 1.2,
  tickLenMax: 9.5,
  tickGamma: 1.5,
  nodalCut: 0.1,
  tickAngleJitter: 0.05,
  tickNeighborMargin: 0.85,
  seamGap: 5.5,
  crossChance: 0.55,
  crossGamma: 2.2,
  crossLenScale: 0.6,
  lineWidthMin: 0.5,
  lineWidthMax: 1.4,
  bg: '#ffffff',
  fg: '#111111',
};

// Rectangular plate with free superposition of the (m, n) and (n, m) modes.
// Returns amplitude in [-|a|-|b|, |a|+|b|] for x, y in [0, 1].
function chladni(mode: Mode, x: number, y: number): number {
  const { m, n, a, b } = mode;
  const p = Math.PI;
  return a * Math.sin(p * n * x) * Math.sin(p * m * y) + b * Math.sin(p * m * x) * Math.sin(p * n * y);
}

function chladniGrad(mode: Mode, x: number, y: number): Point {
  const { m, n, a, b } = mode;
  const p = Math.PI;
  return {
    x:
      a * p * n * Math.cos(p * n * x) * Math.sin(p * m * y) +
      b * p * m * Math.cos(p * m * x) * Math.sin(p * n * y),
    y:
      a * p * m * Math.sin(p * n * x) * Math.cos(p * m * y) +
      b * p * n * Math.sin(p * m * x) * Math.cos(p * n * y),
  };
}

function pickMode(): Mode {
  let m = Random.rangeFloor(2, 9);
  let n = Random.rangeFloor(1, 8);
  if (m === n) n = m + Random.pick([-1, 1, 2]);
  if (n < 1) n = 2;
  const a = 1;
  const b = Random.pick([1, -1, 0.6, -0.6]);
  return { m, n, a, b };
}

type SpatialGrid = ReturnType<typeof createSpatialGrid>;

function createSpatialGrid(cellSize: number) {
  const cells = new Map<string, { x: number; y: number; lineId: number }[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;

  function insert(x: number, y: number, lineId: number): void {
    const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize));
    let bucket = cells.get(k);
    if (!bucket) {
      bucket = [];
      cells.set(k, bucket);
    }
    bucket.push({ x, y, lineId });
  }

  function nearestDist(x: number, y: number, excludeLineId: number): number {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = cells.get(key(cx + dx, cy + dy));
        if (!bucket) continue;
        for (const p of bucket) {
          if (p.lineId === excludeLineId) continue;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  return { insert, nearestDist };
}

interface Plate {
  mode: Mode;
  x0: number;
  y0: number;
  size: number;
  ampMax: number;
}

const toUnit = (plate: Plate, x: number, y: number): Point => ({
  x: (x - plate.x0) / plate.size,
  y: (y - plate.y0) / plate.size,
});

const inside = (plate: Plate, x: number, y: number): boolean =>
  x > plate.x0 && x < plate.x0 + plate.size && y > plate.y0 && y < plate.y0 + plate.size;

// Unit gradient direction in pixel space, or null at a critical point.
function direction(plate: Plate, x: number, y: number): Point | null {
  const u = toUnit(plate, x, y);
  const g = chladniGrad(plate.mode, u.x, u.y);
  const mag = Math.hypot(g.x, g.y);
  if (mag < config.minGrad * plate.ampMax * Math.PI) return null;
  return { x: g.x / mag, y: g.y / mag };
}

// Follow the gradient one way from a seed with midpoint (RK2) steps, stopping at
// the plate rim, at peaks/saddles, or before crowding a line already placed.
function traceHalf(plate: Plate, seed: Point, sign: number, grid: SpatialGrid): Point[] {
  const pts: Point[] = [];
  let p = { ...seed };
  for (let i = 0; i < config.maxSteps; i++) {
    const d1 = direction(plate, p.x, p.y);
    if (!d1) break;
    const mid = { x: p.x + d1.x * config.step * 0.5 * sign, y: p.y + d1.y * config.step * 0.5 * sign };
    const d2 = direction(plate, mid.x, mid.y);
    if (!d2) break;
    const next = { x: p.x + d2.x * config.step * sign, y: p.y + d2.y * config.step * sign };
    if (!inside(plate, next.x, next.y)) break;
    if (grid.nearestDist(next.x, next.y, -1) < config.lineTest) break;
    // a gradient line that turns back on itself has stalled at a ridge
    const prev = pts[pts.length - 2];
    if (prev && Math.hypot(prev.x - next.x, prev.y - next.y) < config.step * 0.5) break;
    pts.push(next);
    p = next;
  }
  return pts;
}

function traceLines(plate: Plate): { lines: Point[][]; grid: SpatialGrid } {
  const grid = createSpatialGrid(config.lineSep);
  const lines: Point[][] = [];
  const seeds: Point[] = [];
  const s = config.lineSep;
  for (let y = plate.y0 + s / 2; y < plate.y0 + plate.size; y += s) {
    for (let x = plate.x0 + s / 2; x < plate.x0 + plate.size; x += s) {
      seeds.push({ x: x + Random.range(-s, s) * 0.3, y: y + Random.range(-s, s) * 0.3 });
    }
  }
  for (const seed of Random.shuffle(seeds) as Point[]) {
    if (grid.nearestDist(seed.x, seed.y, -1) < config.lineSep) continue;
    const fwd = traceHalf(plate, seed, 1, grid);
    const back = traceHalf(plate, seed, -1, grid);
    const line = [...back.reverse(), seed, ...fwd];
    if (line.length < 6) continue;
    const id = lines.length;
    for (const q of line) grid.insert(q.x, q.y, id);
    lines.push(line);
  }
  return { lines, grid };
}

function buildTicks(plate: Plate, lines: Point[][], grid: SpatialGrid): Tick[] {
  const ticks: Tick[] = [];
  lines.forEach((pts, lineId) => {
    let acc = 0;
    let nextAt = Random.range(0, config.tickSpacing);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen <= 0) continue;
      while (acc + segLen >= nextAt) {
        const t = clamp((nextAt - acc) / segLen, 0, 1);
        nextAt += config.tickSpacing + Random.range(-1, 1) * config.tickSpacingJitter;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;

        // |amplitude| sets the tick: full at an antinode, nothing near a nodal line
        const u = toUnit(plate, x, y);
        const amp = Math.abs(chladni(plate.mode, u.x, u.y)) / plate.ampMax;
        if (amp < config.nodalCut) continue;
        const k = (amp - config.nodalCut) / (1 - config.nodalCut);

        const tangent = Math.atan2(b.y - a.y, b.x - a.x);
        const normal = tangent + Math.PI / 2 + Random.range(-1, 1) * config.tickAngleJitter;
        const ideal = config.tickLenMin + (config.tickLenMax - config.tickLenMin) * k ** config.tickGamma;
        const neighbor = grid.nearestDist(x, y, lineId);
        // where gradient lines pile into a seam, leave it quiet rather than inked
        if (neighbor < config.seamGap) continue;
        const safe = Number.isFinite(neighbor) ? neighbor * config.tickNeighborMargin : config.tickLenMax;
        const len = Math.min(ideal, safe);
        if (len < config.tickLenMin * 0.6) continue;
        const weight = config.lineWidthMin + (config.lineWidthMax - config.lineWidthMin) * k;
        ticks.push({ x, y, angle: normal, len, weight });

        // along-line crosses only in the loudest bellies: tone, not outline
        if (Random.chance(config.crossChance * k ** config.crossGamma)) {
          const crossLen = Math.min(len * config.crossLenScale, config.tickSpacing * 0.8);
          ticks.push({ x, y, angle: tangent, len: crossLen, weight });
        }
      }
      acc += segLen;
    }
  });
  return ticks;
}

function sampleAmpMax(mode: Mode): number {
  let max = 0;
  const res = 240;
  for (let j = 0; j <= res; j++) {
    for (let i = 0; i <= res; i++) {
      max = Math.max(max, Math.abs(chladni(mode, i / res, j / res)));
    }
  }
  return max || 1;
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  Random.setSeed(config.seed);
  const mode = pickMode();
  const size = Math.min(width, height) - config.margin * 2;
  const plate: Plate = {
    mode,
    x0: (width - size) / 2,
    y0: (height - size) / 2,
    size,
    ampMax: sampleAmpMax(mode),
  };
  const { lines, grid } = traceLines(plate);
  const ticks = buildTicks(plate, lines, grid);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = config.fg;
    context.lineCap = 'round';
    for (const tick of ticks) {
      const hx = Math.cos(tick.angle) * tick.len * 0.5;
      const hy = Math.sin(tick.angle) * tick.len * 0.5;
      context.lineWidth = tick.weight;
      context.beginPath();
      context.moveTo(tick.x - hx, tick.y - hy);
      context.lineTo(tick.x + hx, tick.y + hy);
      context.stroke();
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
