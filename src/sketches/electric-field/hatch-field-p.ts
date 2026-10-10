import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clamp } from 'canvas-sketch-util/math';
import { renderPenplot, setupPenplotExport } from '../../penplot/render-penplot';
import { getDimensionsFromPreset } from '../../penplot/distances';

// electric-field/hatch-field taken off the screen: the same dipole traced into
// field lines and drawn only as cross ticks whose length decays with distance
// from the charges, exported as an A4 plotter SVG (Cmd/Ctrl+S).
// The field is solved in a working pixel frame and every tick is scaled into
// centimetres; ticks that would cross the margin are dropped, not clipped,
// so the pen never draws a cut stroke.

interface Charge {
  x: number;
  y: number;
  q: number;
}

interface Point {
  x: number;
  y: number;
}

interface FieldPath {
  pts: Point[];
  dists: number[];
}

interface Tick {
  x: number;
  y: number;
  angle: number;
  len: number;
}

type Polyline = [number, number][];

const units = 'cm';
const [physicalWidth, physicalHeight] = getDimensionsFromPreset('a4', units);

const config = {
  seed: 11,
  marginCm: 2,
  workWidth: 1080, // the working pixel frame the field is solved in
  seedsPerCharge: 48,
  seedRadius: 14,
  edgeSeedSpacing: 45,
  stepMin: 2,
  stepMax: 9,
  maxSteps: 1200,
  absorbRadius: 18,
  innerClearRadius: 24,
  minSeparation: 6,
  traceGraceRadius: 60,
  tickFalloffDist: 300,
  tickFieldGamma: 0.55,
  tickSpacing: 9,
  tickSpacingJitter: 3,
  tickLenMin: 2,
  tickLenMax: 9,
  tickAngleJitter: 0.06,
  tickNeighborMargin: 0.8,
  crossChance: 0.15,
  crossLenScale: 0.55,
  penWidthCm: 0.03,
};

// --- field + tracing, copied from electric-field/hatch-field -----------------

function fieldAt(x: number, y: number, charges: Charge[]): Point {
  let fx = 0;
  let fy = 0;
  for (const c of charges) {
    const dx = x - c.x;
    const dy = y - c.y;
    const rSq = dx * dx + dy * dy;
    const r = Math.sqrt(rSq) || 1e-6;
    const inv = c.q / (rSq * r);
    fx += dx * inv;
    fy += dy * inv;
  }
  return { x: fx, y: fy };
}

function nearestChargeDist(x: number, y: number, charges: Charge[]): number {
  let best = Infinity;
  for (const c of charges) best = Math.min(best, Math.hypot(x - c.x, y - c.y));
  return best;
}

interface GridEntry {
  x: number;
  y: number;
  lineId: number;
}

type SpatialGrid = ReturnType<typeof createSpatialGrid>;

function createSpatialGrid(cellSize: number) {
  const cells = new Map<string, GridEntry[]>();
  const cellKey = (cx: number, cy: number) => `${cx},${cy}`;

  function insert(x: number, y: number, lineId: number): void {
    const k = cellKey(Math.floor(x / cellSize), Math.floor(y / cellSize));
    const bucket = cells.get(k) ?? [];
    bucket.push({ x, y, lineId });
    cells.set(k, bucket);
  }

  function nearestDist(x: number, y: number, excludeLineId: number): number {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const p of cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (p.lineId === excludeLineId) continue;
          best = Math.min(best, Math.hypot(p.x - x, p.y - y));
        }
      }
    }
    return best;
  }

  return { insert, nearestDist };
}

// One dipole set across the long axis of the sheet.
function generateCharges(width: number, height: number): Charge[] {
  const mx = width * 0.3;
  const my = height * 0.28;
  const minSep = height * 0.3;
  let a: Point;
  let b: Point;
  let attempts = 0;
  do {
    a = { x: Random.range(mx, width - mx), y: Random.range(my, height * 0.5) };
    b = { x: Random.range(mx, width - mx), y: Random.range(height * 0.5, height - my) };
    attempts++;
  } while (Math.hypot(a.x - b.x, a.y - b.y) < minSep && attempts < 50);
  return [
    { x: a.x, y: a.y, q: 1 },
    { x: b.x, y: b.y, q: -1 },
  ];
}

function generateSeeds(charges: Charge[], width: number, height: number): Point[] {
  const seeds: Point[] = [];
  for (const c of charges) {
    if (c.q <= 0) continue;
    for (let i = 0; i < config.seedsPerCharge; i++) {
      const a = (i / config.seedsPerCharge) * Math.PI * 2;
      seeds.push({ x: c.x + Math.cos(a) * config.seedRadius, y: c.y + Math.sin(a) * config.seedRadius });
    }
  }
  const s = config.edgeSeedSpacing;
  const inset = 4;
  for (let x = inset; x <= width - inset; x += s) {
    seeds.push({ x, y: inset }, { x, y: height - inset });
  }
  for (let y = inset; y <= height - inset; y += s) {
    seeds.push({ x: inset, y }, { x: width - inset, y });
  }
  return seeds;
}

function traceSingleLine(
  seed: Point,
  charges: Charge[],
  width: number,
  height: number,
  grid: SpatialGrid,
): FieldPath {
  let pos: Point = { ...seed };
  const pts: Point[] = [{ ...pos }];
  const dists: number[] = [nearestChargeDist(pos.x, pos.y, charges)];

  for (let step = 0; step < config.maxSteps; step++) {
    const sink = charges.find(
      (c) => c.q < 0 && Math.hypot(pos.x - c.x, pos.y - c.y) < config.absorbRadius,
    );
    if (sink) {
      pts.push({ x: sink.x, y: sink.y });
      dists.push(0);
      break;
    }
    if (pos.x < -20 || pos.x > width + 20 || pos.y < -20 || pos.y > height + 20) break;

    const f = fieldAt(pos.x, pos.y, charges);
    const mag = Math.hypot(f.x, f.y);
    if (mag < 1e-12) break;

    const dNearest = nearestChargeDist(pos.x, pos.y, charges);
    const stepSize = clamp(dNearest * 0.12, config.stepMin, config.stepMax);
    const next: Point = { x: pos.x + (f.x / mag) * stepSize, y: pos.y + (f.y / mag) * stepSize };

    // Past the seed cluster, stop a line before it crowds an already-traced one.
    if (Math.hypot(next.x - seed.x, next.y - seed.y) > config.traceGraceRadius) {
      if (grid.nearestDist(next.x, next.y, -1) < config.minSeparation) break;
    }

    pos = next;
    pts.push({ ...pos });
    dists.push(nearestChargeDist(pos.x, pos.y, charges));
  }
  return { pts, dists };
}

function traceFieldLines(charges: Charge[], width: number, height: number) {
  const grid = createSpatialGrid(config.minSeparation);
  const paths: FieldPath[] = [];
  for (const seed of generateSeeds(charges, width, height)) {
    const path = traceSingleLine(seed, charges, width, height, grid);
    if (path.pts.length >= 2) {
      for (const p of path.pts) grid.insert(p.x, p.y, paths.length);
      paths.push(path);
    }
  }
  return { paths, grid };
}

function buildTicks(paths: FieldPath[], grid: SpatialGrid): Tick[] {
  const ticks: Tick[] = [];
  const nextGap = () =>
    config.tickSpacing + Random.range(-config.tickSpacingJitter, config.tickSpacingJitter);

  paths.forEach(({ pts, dists }, lineId) => {
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
        const dNearest = dists[i - 1] + (dists[i] - dists[i - 1]) * t;
        nextAt += nextGap();
        if (dNearest < config.innerClearRadius) continue;

        const tangentAngle = Math.atan2(b.y - a.y, b.x - a.x);
        const normalAngle =
          tangentAngle + Math.PI / 2 + Random.range(-config.tickAngleJitter, config.tickAngleJitter);

        // Length decays with distance from the nearest charge.
        const tNorm =
          1 - clamp((dNearest - config.innerClearRadius) / config.tickFalloffDist, 0, 1);
        const idealLen =
          config.tickLenMin + (config.tickLenMax - config.tickLenMin) * tNorm ** config.tickFieldGamma;
        const neighborDist = grid.nearestDist(x, y, lineId);
        const maxSafeLen = Number.isFinite(neighborDist)
          ? neighborDist * config.tickNeighborMargin
          : config.tickLenMax;
        const len = Math.min(idealLen, maxSafeLen);

        ticks.push({ x, y, angle: normalAngle, len });
        if (Random.chance(config.crossChance)) {
          const tangentLen = Math.min(len * config.crossLenScale, config.tickSpacing * 0.8);
          ticks.push({ x, y, angle: tangentAngle, len: tangentLen });
        }
      }
      acc += segLen;
    }
  });
  return ticks;
}

// --- paper ------------------------------------------------------------------

function buildPolylines(): Polyline[] {
  Random.setSeed(config.seed);
  const scale = physicalWidth / config.workWidth; // cm per working pixel
  const workHeight = physicalHeight / scale;
  const charges = generateCharges(config.workWidth, workHeight);
  const { paths, grid } = traceFieldLines(charges, config.workWidth, workHeight);
  const ticks = buildTicks(paths, grid);

  const m = config.marginCm;
  const inside = (x: number, y: number) =>
    x >= m && x <= physicalWidth - m && y >= m && y <= physicalHeight - m;

  const lines: Polyline[] = [];
  for (const t of ticks) {
    const hx = Math.cos(t.angle) * t.len * 0.5;
    const hy = Math.sin(t.angle) * t.len * 0.5;
    const x0 = (t.x - hx) * scale;
    const y0 = (t.y - hy) * scale;
    const x1 = (t.x + hx) * scale;
    const y1 = (t.y + hy) * scale;
    if (!inside(x0, y0) || !inside(x1, y1)) continue;
    lines.push([
      [x0, y0],
      [x1, y1],
    ]);
  }
  return lines;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  let latestSvg: string | null = null;
  const cleanupExport = setupPenplotExport(settings, () => latestSvg);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanupExport();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  const polylines = buildPolylines();

  wrap.render = ({ width, height }: SketchProps) => {
    latestSvg = renderPenplot(polylines, {
      context,
      width,
      height,
      physicalWidth,
      physicalHeight,
      units,
      lineWidth: config.penWidthCm,
      optimize: true,
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, Math.round(1080 * (physicalHeight / physicalWidth))],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
