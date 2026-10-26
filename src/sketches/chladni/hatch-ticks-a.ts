import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clamp } from 'canvas-sketch-util/math';

/**
 * A Chladni plate drawn the way electric-field/hatch-field draws a charge field:
 * the gradient of the standing wave is traced into evenly spaced streamlines
 * (antinode to antinode, crossing every nodal line at right angles), and each
 * streamline is drawn only as short cross ticks. Tick length follows the local
 * amplitude |f|, so the ticks shrink to nothing where the plate is still and the
 * nodal lines read as white channels through a black hatch.
 */

interface Point {
  x: number;
  y: number;
}

interface Tick {
  x: number;
  y: number;
  angle: number;
  len: number;
}

interface Mode {
  m: number;
  n: number;
  b: number;
}

const config = {
  seed: 7,
  margin: 72,
  // streamline spacing (Jobard–Lefer style: seed at dSep, stop at dTest)
  dSep: 8.5,
  dTestRatio: 0.55,
  step: 1.5,
  maxSteps: 2400,
  // ticks
  tickSpacing: 5,
  tickSpacingJitter: 1.5,
  tickLenMax: 7.5,
  tickLenMin: 1.6,
  ampGamma: 0.5,
  tickAngleJitter: 0.05,
  tickNeighborMargin: 0.85,
  crossChance: 0.7,
  crossLenScale: 0.6,
  lineWidth: 1.25,
  bg: '#ffffff',
  fg: '#111111',
};

// sin–sin plate: zero on the boundary, so the plate edge is itself a nodal line
function chladni(u: number, v: number, { m, n, b }: Mode): number {
  return (
    Math.sin(Math.PI * n * u) * Math.sin(Math.PI * m * v) +
    b * Math.sin(Math.PI * m * u) * Math.sin(Math.PI * n * v)
  );
}

type SpatialGrid = ReturnType<typeof createSpatialGrid>;

function createSpatialGrid(cellSize: number) {
  const cells = new Map<string, { x: number; y: number; lineId: number }[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;

  function insert(x: number, y: number, lineId: number): void {
    const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize));
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
        for (const p of cells.get(key(cx + dx, cy + dy)) ?? []) {
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

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  Random.setSeed(config.seed);

  const m = Random.rangeFloor(2, 8);
  let n = Random.rangeFloor(2, 8);
  while (n === m) n = Random.rangeFloor(2, 8);
  const mode: Mode = { m, n, b: Random.pick([1, -1]) };

  const x0 = config.margin;
  const y0 = config.margin;
  const size = Math.min(width, height) - config.margin * 2;
  const inPlate = (p: Point) => p.x >= x0 && p.x <= x0 + size && p.y >= y0 && p.y <= y0 + size;
  const fieldAt = (p: Point) => chladni((p.x - x0) / size, (p.y - y0) / size, mode);

  // central-difference gradient in pixel space
  const h = 0.5;
  const gradAt = (p: Point): Point => ({
    x: (fieldAt({ x: p.x + h, y: p.y }) - fieldAt({ x: p.x - h, y: p.y })) / (2 * h),
    y: (fieldAt({ x: p.x, y: p.y + h }) - fieldAt({ x: p.x, y: p.y - h })) / (2 * h),
  });

  // peak amplitude, so tick length is relative to the loudest point on this plate
  let fMax = 0;
  for (let u = 0; u <= 1; u += 1 / 200) {
    for (let v = 0; v <= 1; v += 1 / 200) {
      fMax = Math.max(fMax, Math.abs(chladni(u, v, mode)));
    }
  }

  const dTest = config.dSep * config.dTestRatio;
  const grid = createSpatialGrid(config.dSep);

  function traceHalf(seed: Point, dir: 1 | -1): Point[] {
    const pts: Point[] = [];
    let pos = seed;
    for (let i = 0; i < config.maxSteps; i++) {
      const g = gradAt(pos);
      const mag = Math.hypot(g.x, g.y);
      // flat at an antinode peak: the line ends there
      if (mag < 1e-5) break;
      const next = {
        x: pos.x + (dir * g.x * config.step) / mag,
        y: pos.y + (dir * g.y * config.step) / mag,
      };
      if (!inPlate(next) || grid.nearestDist(next.x, next.y, -1) < dTest) break;
      pts.push(next);
      pos = next;
    }
    return pts;
  }

  // shuffled seed lattice at dSep; each seed grows a streamline both ways up and down the gradient
  const seeds: Point[] = [];
  for (let y = y0 + config.dSep / 2; y < y0 + size; y += config.dSep) {
    for (let x = x0 + config.dSep / 2; x < x0 + size; x += config.dSep) {
      seeds.push({ x, y });
    }
  }
  const lines: Point[][] = [];
  for (const seed of Random.shuffle(seeds) as Point[]) {
    if (grid.nearestDist(seed.x, seed.y, -1) < config.dSep) continue;
    const pts = [...traceHalf(seed, -1).reverse(), seed, ...traceHalf(seed, 1)];
    if (pts.length < 4) continue;
    for (const p of pts) grid.insert(p.x, p.y, lines.length);
    lines.push(pts);
  }

  const ticks: Tick[] = [];
  lines.forEach((pts, lineId) => {
    let acc = 0;
    let nextAt = Random.range(0, config.tickSpacing);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      while (acc + segLen >= nextAt) {
        const t = clamp((nextAt - acc) / segLen, 0, 1);
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        nextAt +=
          config.tickSpacing + Random.range(-config.tickSpacingJitter, config.tickSpacingJitter);

        const amp = Math.abs(fieldAt(p)) / fMax;
        const idealLen = config.tickLenMax * amp ** config.ampGamma;
        // the quiet band around a nodal line stays empty
        if (idealLen < config.tickLenMin) continue;

        const neighborDist = grid.nearestDist(p.x, p.y, lineId);
        const len = Math.min(idealLen, neighborDist * config.tickNeighborMargin);
        const tangent = Math.atan2(b.y - a.y, b.x - a.x);
        ticks.push({
          ...p,
          angle: tangent + Math.PI / 2 + Random.gaussian(0, config.tickAngleJitter),
          len,
        });
        // loud regions pick up a second, along-line stroke: the antinodes darken
        if (Random.chance(config.crossChance * amp * amp)) {
          ticks.push({
            ...p,
            angle: tangent,
            len: Math.min(len * config.crossLenScale, config.tickSpacing * 0.8),
          });
        }
      }
      acc += segLen;
    }
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = config.fg;
    context.lineWidth = config.lineWidth;
    context.lineCap = 'round';
    context.beginPath();
    for (const { x, y, angle, len } of ticks) {
      const hx = Math.cos(angle) * len * 0.5;
      const hy = Math.sin(angle) * len * 0.5;
      context.moveTo(x - hx, y - hy);
      context.lineTo(x + hx, y + hy);
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
