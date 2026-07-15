import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { clamp } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

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

const config = {
  seed: 1,
  numCharges: 2,
  seedsPerCharge: 48,
  seedRadius: 14,
  edgeSeedSpacing: 45,
  stepMin: 2,
  stepMax: 9,
  maxSteps: 900,
  absorbRadius: 18,
  innerClearRadius: 24,
  minSeparation: 6,
  traceGraceRadius: 60,
  tickFalloffDist: 240,
  tickFieldGamma: 0.55,
  tickSpacing: 9,
  tickSpacingJitter: 3,
  tickLenMin: 2,
  tickLenMax: 9,
  tickAngleJitter: 0.06,
  tickNeighborMargin: 0.8,
  crossChance: 0.15,
  crossLenScale: 0.55,
  lineWidth: 0.9,
  bg: '#ffffff',
  fg: '#111111',
};

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
  for (const c of charges) {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < best) best = d;
  }
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

  function cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  function insert(x: number, y: number, lineId: number): void {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    const k = cellKey(cx, cy);
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
        const bucket = cells.get(cellKey(cx + dx, cy + dy));
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

function generateCharges(width: number, height: number, numCharges: number): Charge[] {
  const pairs = Math.max(1, Math.floor(numCharges / 2));
  const marginX = width * 0.22;
  const marginY = height * 0.22;
  const minSep = Math.min(width, height) * 0.35;
  const charges: Charge[] = [];
  for (let i = 0; i < pairs; i++) {
    let a: Point;
    let b: Point;
    let attempts = 0;
    do {
      a = {
        x: Random.range(marginX, width - marginX),
        y: Random.range(marginY, height - marginY),
      };
      b = {
        x: Random.range(marginX, width - marginX),
        y: Random.range(marginY, height - marginY),
      };
      attempts++;
    } while (Math.hypot(a.x - b.x, a.y - b.y) < minSep && attempts < 50);
    charges.push({ x: a.x, y: a.y, q: 1 });
    charges.push({ x: b.x, y: b.y, q: -1 });
  }
  return charges;
}

function generateChargeSeeds(charges: Charge[], seedsPerCharge: number, seedRadius: number): Point[] {
  const seeds: Point[] = [];
  for (const c of charges) {
    if (c.q <= 0) continue;
    for (let i = 0; i < seedsPerCharge; i++) {
      const a = (i / seedsPerCharge) * Math.PI * 2;
      seeds.push({ x: c.x + Math.cos(a) * seedRadius, y: c.y + Math.sin(a) * seedRadius });
    }
  }
  return seeds;
}

function generateEdgeSeeds(width: number, height: number, spacing: number, inset: number): Point[] {
  const seeds: Point[] = [];
  for (let x = inset; x <= width - inset; x += spacing) {
    seeds.push({ x, y: inset });
    seeds.push({ x, y: height - inset });
  }
  for (let y = inset; y <= height - inset; y += spacing) {
    seeds.push({ x: inset, y });
    seeds.push({ x: width - inset, y });
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
    let absorbed = false;
    for (const c of charges) {
      if (c.q < 0 && Math.hypot(pos.x - c.x, pos.y - c.y) < config.absorbRadius) {
        pts.push({ x: c.x, y: c.y });
        dists.push(0);
        absorbed = true;
        break;
      }
    }
    if (absorbed) break;

    if (pos.x < -20 || pos.x > width + 20 || pos.y < -20 || pos.y > height + 20) break;

    const f = fieldAt(pos.x, pos.y, charges);
    const mag = Math.hypot(f.x, f.y);
    if (mag < 1e-12) break;

    const nx = f.x / mag;
    const ny = f.y / mag;
    const dNearest = nearestChargeDist(pos.x, pos.y, charges);
    const stepSize = clamp(dNearest * 0.12, config.stepMin, config.stepMax);

    const next: Point = { x: pos.x + nx * stepSize, y: pos.y + ny * stepSize };

    // Once a line has escaped the tight seed cluster, terminate it before
    // it drifts closer than minSeparation to an already-traced line.
    const distFromSeed = Math.hypot(next.x - seed.x, next.y - seed.y);
    if (distFromSeed > config.traceGraceRadius) {
      const nd = grid.nearestDist(next.x, next.y, -1);
      if (nd < config.minSeparation) break;
    }

    pos = next;
    pts.push({ ...pos });
    dists.push(nearestChargeDist(pos.x, pos.y, charges));
  }

  return { pts, dists };
}

function traceFieldLines(
  charges: Charge[],
  width: number,
  height: number,
): { paths: FieldPath[]; grid: SpatialGrid } {
  const seeds = [
    ...generateChargeSeeds(charges, config.seedsPerCharge, config.seedRadius),
    ...generateEdgeSeeds(width, height, config.edgeSeedSpacing, 4),
  ];
  const grid = createSpatialGrid(config.minSeparation);
  const paths: FieldPath[] = [];
  let lineId = 0;
  for (const seed of seeds) {
    const path = traceSingleLine(seed, charges, width, height, grid);
    if (path.pts.length >= 2) {
      for (const p of path.pts) grid.insert(p.x, p.y, lineId);
      paths.push(path);
      lineId++;
    }
  }
  return { paths, grid };
}

function buildTicks(paths: FieldPath[], grid: SpatialGrid): Tick[] {
  const ticks: Tick[] = [];
  paths.forEach(({ pts, dists }, lineId) => {
    if (pts.length < 2) return;
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

        const dA = dists[i - 1] ?? 0;
        const dB = dists[i] ?? dA;
        const dNearest = dA + (dB - dA) * t;
        if (dNearest < config.innerClearRadius) {
          nextAt += config.tickSpacing + Random.range(-config.tickSpacingJitter, config.tickSpacingJitter);
          continue;
        }

        const tangentAngle = Math.atan2(b.y - a.y, b.x - a.x);
        const normalAngle = tangentAngle + Math.PI / 2 + Random.range(-config.tickAngleJitter, config.tickAngleJitter);

        const tNorm = 1 - clamp((dNearest - config.innerClearRadius) / config.tickFalloffDist, 0, 1);
        const idealLen = config.tickLenMin + (config.tickLenMax - config.tickLenMin) * tNorm ** config.tickFieldGamma;

        // Cap the tick so it can never reach far enough to touch a neighboring line's tick.
        const neighborDist = grid.nearestDist(x, y, lineId);
        const maxSafeLen = Number.isFinite(neighborDist)
          ? neighborDist * config.tickNeighborMargin
          : config.tickLenMax;
        const len = Math.min(idealLen, maxSafeLen, config.tickLenMax);

        ticks.push({ x, y, angle: normalAngle, len });
        if (Random.chance(config.crossChance)) {
          // Along-path cross tick: also cap by tickSpacing so it can't reach the next tick on this line.
          const tangentLen = Math.min(len * config.crossLenScale, config.tickSpacing * 0.8);
          ticks.push({ x, y, angle: tangentAngle, len: tangentLen });
        }

        nextAt += config.tickSpacing + Random.range(-config.tickSpacingJitter, config.tickSpacingJitter);
      }
      acc += segLen;
    }
  });
  return ticks;
}

function drawTicks(context: CanvasRenderingContext2D, ticks: Tick[], width: number, height: number): void {
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();

  context.strokeStyle = config.fg;
  context.lineWidth = config.lineWidth;
  context.lineCap = 'round';

  for (const tick of ticks) {
    const hx = Math.cos(tick.angle) * tick.len * 0.5;
    const hy = Math.sin(tick.angle) * tick.len * 0.5;
    context.beginPath();
    context.moveTo(tick.x - hx, tick.y - hy);
    context.lineTo(tick.x + hx, tick.y + hy);
    context.stroke();
  }

  context.restore();
}

export const sketch = ({ wrap, context, width, height, render, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  let charges: Charge[] = [];
  let ticks: Tick[] = [];

  function buildScene(): void {
    Random.setSeed(config.seed);
    charges = generateCharges(width, height, config.numCharges);
    const { paths, grid } = traceFieldLines(charges, width, height);
    ticks = buildTicks(paths, grid);
  }

  buildScene();

  const pane = new Pane({ title: 'Hatch Field' }) as any;
  pane.containerElem_.style.zIndex = 1;

  pane.addButton({ title: 'Regenerate' }).on('click', () => {
    config.seed = Math.floor(Math.random() * 9998) + 1;
    pane.refresh();
    buildScene();
    render();
  });

  pane.addBinding(config, 'seed', { min: 1, max: 9999, step: 1 });
  pane.addBinding(config, 'numCharges', { min: 2, max: 6, step: 2 });
  pane.addBinding(config, 'seedsPerCharge', { min: 8, max: 120, step: 1 });
  pane.addBinding(config, 'seedRadius', { min: 4, max: 40, step: 1 });
  pane.addBinding(config, 'edgeSeedSpacing', { min: 15, max: 120, step: 1 });
  pane.addBinding(config, 'stepMin', { min: 0.5, max: 10, step: 0.5 });
  pane.addBinding(config, 'stepMax', { min: 1, max: 25, step: 0.5 });
  pane.addBinding(config, 'maxSteps', { min: 100, max: 3000, step: 50 });
  pane.addBinding(config, 'absorbRadius', { min: 5, max: 60, step: 1 });
  pane.addBinding(config, 'innerClearRadius', { min: 2, max: 80, step: 1 });
  pane.addBinding(config, 'minSeparation', { min: 2, max: 40, step: 0.5 });
  pane.addBinding(config, 'traceGraceRadius', { min: 10, max: 200, step: 1 });
  pane.addBinding(config, 'tickFalloffDist', { min: 20, max: 800, step: 5 });
  pane.addBinding(config, 'tickFieldGamma', { min: 0.1, max: 3, step: 0.05 });
  pane.addBinding(config, 'tickSpacing', { min: 2, max: 30, step: 0.5 });
  pane.addBinding(config, 'tickSpacingJitter', { min: 0, max: 15, step: 0.5 });
  pane.addBinding(config, 'tickLenMin', { min: 0.5, max: 20, step: 0.5 });
  pane.addBinding(config, 'tickLenMax', { min: 1, max: 40, step: 0.5 });
  pane.addBinding(config, 'tickAngleJitter', { min: 0, max: 0.3, step: 0.01 });
  pane.addBinding(config, 'tickNeighborMargin', { min: 0.3, max: 1, step: 0.05 });
  pane.addBinding(config, 'crossChance', { min: 0, max: 1, step: 0.01 });
  pane.addBinding(config, 'crossLenScale', { min: 0.1, max: 1, step: 0.05 });
  pane.addBinding(config, 'lineWidth', { min: 0.3, max: 4, step: 0.1 });
  pane.addBinding(config, 'bg');
  pane.addBinding(config, 'fg');

  pane.on('change', () => {
    buildScene();
    render();
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);
    drawTicks(context, ticks, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
