import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clamp } from 'canvas-sketch-util/math';

// Chladni nodal lines drawn the way electric-field/hatch-field draws a field:
// evenly spaced streamlines of the plate's gradient, each carrying short cross
// ticks whose length follows the displacement |f|. The ticks shrink to nothing
// where the plate is still, so the nodal lines read as gaps in the hatch.

interface Point {
  x: number;
  y: number;
}

interface FieldSample {
  f: number;
  gx: number;
  gy: number;
}

interface Tick {
  x: number;
  y: number;
  angle: number;
  len: number;
}

interface Plate {
  x0: number;
  y0: number;
  size: number;
  m: number;
  n: number;
  b: number;
  fMax: number;
}

const config = {
  seed: Random.getRandomSeed(),
  margin: 72,
  dSep: 9,
  dTestRatio: 0.55,
  step: 1.5,
  maxSteps: 2000,
  gradientStop: 0.015,
  tickSpacing: 7,
  tickSpacingJitter: 2,
  tickLenMax: 10,
  tickGamma: 1.1,
  quiet: 0.06,
  tickAngleJitter: 0.05,
  tickNeighborMargin: 0.8,
  crossChance: 0.1,
  crossLenScale: 0.55,
  lineWidth: 1.25,
  bg: '#ffffff',
  fg: '#111111',
};

// chladni closed form on the unit plate with its analytic gradient
function sampleField(plate: Plate, px: number, py: number): FieldSample {
  const { m, n, b } = plate;
  const u = (px - plate.x0) / plate.size;
  const v = (py - plate.y0) / plate.size;
  const pi = Math.PI;
  const snu = Math.sin(n * pi * u);
  const cnu = Math.cos(n * pi * u);
  const smu = Math.sin(m * pi * u);
  const cmu = Math.cos(m * pi * u);
  const snv = Math.sin(n * pi * v);
  const cnv = Math.cos(n * pi * v);
  const smv = Math.sin(m * pi * v);
  const cmv = Math.cos(m * pi * v);
  return {
    f: snu * smv + b * smu * snv,
    gx: n * pi * cnu * smv + b * m * pi * cmu * snv,
    gy: m * pi * snu * cmv + b * n * pi * smu * cnv,
  };
}

interface GridEntry {
  x: number;
  y: number;
  lineId: number;
}

type SpatialGrid = ReturnType<typeof createSpatialGrid>;

function createSpatialGrid(cellSize: number) {
  const cells = new Map<string, GridEntry[]>();
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

  // nearest point on any other line, reliable out to cellSize
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

function inside(plate: Plate, p: Point): boolean {
  return (
    p.x >= plate.x0 &&
    p.x <= plate.x0 + plate.size &&
    p.y >= plate.y0 &&
    p.y <= plate.y0 + plate.size
  );
}

function direction(plate: Plate, p: Point, sign: number): Point | null {
  const { gx, gy } = sampleField(plate, p.x, p.y);
  const mag = Math.hypot(gx, gy);
  // stop at antinodes and saddles, where the gradient vanishes
  if (mag < config.gradientStop * Math.PI * Math.max(plate.m, plate.n)) return null;
  return { x: (sign * gx) / mag, y: (sign * gy) / mag };
}

// Follow the gradient uphill (sign 1) or downhill (sign -1) with midpoint steps,
// stopping before the line crowds an existing one (Jobard–Lefer).
function traceHalf(plate: Plate, seed: Point, sign: number, grid: SpatialGrid): Point[] {
  const pts: Point[] = [];
  const dTest = config.dSep * config.dTestRatio;
  const h = config.step;
  let pos = seed;
  let prev: Point | null = null;
  for (let i = 0; i < config.maxSteps; i++) {
    const d1 = direction(plate, pos, sign);
    if (!d1) break;
    const mid = direction(plate, { x: pos.x + d1.x * h * 0.5, y: pos.y + d1.y * h * 0.5 }, sign);
    if (!mid) break;
    // overshooting an extremum flips the direction
    if (prev && prev.x * mid.x + prev.y * mid.y < 0.2) break;
    const next = { x: pos.x + mid.x * h, y: pos.y + mid.y * h };
    if (!inside(plate, next)) break;
    if (grid.nearestDist(next.x, next.y, -1) < dTest) break;
    pts.push(next);
    pos = next;
    prev = mid;
  }
  return pts;
}

function traceStreamlines(plate: Plate): { lines: Point[][]; grid: SpatialGrid } {
  const grid = createSpatialGrid(config.dSep);
  const lines: Point[][] = [];

  // fallback seeds on a shuffled jittered grid catch regions the queue never reaches
  const fallback: Point[] = [];
  const gStep = config.dSep * 3;
  for (let y = plate.y0 + gStep / 2; y < plate.y0 + plate.size; y += gStep) {
    for (let x = plate.x0 + gStep / 2; x < plate.x0 + plate.size; x += gStep) {
      fallback.push({ x: x + Random.range(-2, 2), y: y + Random.range(-2, 2) });
    }
  }
  const seeds = Random.shuffle(fallback) as Point[];
  const queue: Point[] = [];

  while (queue.length || seeds.length) {
    const seed = (queue.length ? queue.shift() : seeds.pop())!;
    if (!inside(plate, seed)) continue;
    if (grid.nearestDist(seed.x, seed.y, -1) < config.dSep) continue;

    const up = traceHalf(plate, seed, 1, grid);
    const down = traceHalf(plate, seed, -1, grid);
    const line = [...down.reverse(), seed, ...up];
    if (line.length < 6) continue;

    const lineId = lines.length;
    for (const p of line) grid.insert(p.x, p.y, lineId);
    lines.push(line);

    // new seeds one separation away on either side of the accepted line
    for (let i = 1; i < line.length - 1; i += 3) {
      const a = line[i - 1];
      const c = line[i + 1];
      const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      const nx = -(c.y - a.y) / len;
      const ny = (c.x - a.x) / len;
      const p = line[i];
      queue.push({ x: p.x + nx * config.dSep, y: p.y + ny * config.dSep });
      queue.push({ x: p.x - nx * config.dSep, y: p.y - ny * config.dSep });
    }
  }

  return { lines, grid };
}

function buildTicks(plate: Plate, lines: Point[][], grid: SpatialGrid): Tick[] {
  const ticks: Tick[] = [];
  const nextGap = () =>
    config.tickSpacing + Random.range(-config.tickSpacingJitter, config.tickSpacingJitter);

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
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        nextAt += nextGap();

        // displacement drives length: full at the antinodes, nothing on the nodal lines
        const amp = Math.abs(sampleField(plate, x, y).f) / plate.fMax;
        if (amp < config.quiet) continue;
        const k = (amp - config.quiet) / (1 - config.quiet);
        const idealLen = config.tickLenMax * k ** config.tickGamma;

        const neighbor = grid.nearestDist(x, y, lineId);
        const safeLen = Number.isFinite(neighbor)
          ? neighbor * config.tickNeighborMargin
          : config.tickLenMax;
        const len = Math.min(idealLen, safeLen);
        if (len < 0.6) continue;

        const tangent = Math.atan2(b.y - a.y, b.x - a.x);
        const normal =
          tangent + Math.PI / 2 + Random.range(-config.tickAngleJitter, config.tickAngleJitter);
        ticks.push({ x, y, angle: normal, len });
        if (Random.chance(config.crossChance * k)) {
          const crossLen = Math.min(len * config.crossLenScale, config.tickSpacing * 0.8);
          ticks.push({ x, y, angle: tangent, len: crossLen });
        }
      }
      acc += segLen;
    }
  });
  return ticks;
}

function createPlate(width: number, height: number): Plate {
  const size = Math.min(width, height) - config.margin * 2;
  const m = Random.rangeFloor(2, 8);
  let n = Random.rangeFloor(1, 8);
  if (n === m) n = m + 1;
  const plate: Plate = {
    x0: (width - size) / 2,
    y0: (height - size) / 2,
    size,
    m,
    n,
    b: Random.sign(),
    fMax: 1,
  };
  let fMax = 0;
  for (let j = 0; j <= 120; j++) {
    for (let i = 0; i <= 120; i++) {
      const s = sampleField(plate, plate.x0 + (i / 120) * size, plate.y0 + (j / 120) * size);
      fMax = Math.max(fMax, Math.abs(s.f));
    }
  }
  plate.fMax = fMax || 1;
  return plate;
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
  const plate = createPlate(width, height);
  const { lines, grid } = traceStreamlines(plate);
  const ticks = buildTicks(plate, lines, grid);
  console.log(`seed ${config.seed} · m ${plate.m} n ${plate.n} b ${plate.b} · ${ticks.length} ticks`);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = config.fg;
    context.lineWidth = config.lineWidth;
    context.lineCap = 'round';
    context.beginPath();
    for (const tick of ticks) {
      const hx = Math.cos(tick.angle) * tick.len * 0.5;
      const hy = Math.sin(tick.angle) * tick.len * 0.5;
      context.moveTo(tick.x - hx, tick.y - hy);
      context.lineTo(tick.x + hx, tick.y + hy);
    }
    context.stroke();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
