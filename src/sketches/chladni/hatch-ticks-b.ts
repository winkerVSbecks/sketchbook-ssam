import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clamp } from 'canvas-sketch-util/math';

// The Chladni field drawn the way electric-field/hatch-field draws a field:
// only short ticks, laid along the level sets of the standing wave. Each
// tick's length decays with its distance to the nearest nodal line, so the
// quiet lines are never drawn — they are where the hatch runs out.

const config = {
  seed: Random.getRandomSeed(),
  margin: 72,
  // sample placement: jittered grid, thinned by a spatial hash
  spacing: 10,
  spacingJitter: 2.5,
  minSeparation: 6.5,
  // tick shape
  tickLenMin: 1,
  tickLenMax: 11,
  tickFalloffDist: 40,
  tickFieldGamma: 0.9,
  clearDist: 7,
  tickAngleJitter: 0.06,
  tickNeighborMargin: 0.8,
  crossChance: 0.15,
  crossLenScale: 0.55,
  lineWidth: 1.1,
  bg: '#ffffff',
  fg: '#111111',
};

interface Point {
  x: number;
  y: number;
}

interface Sample {
  // position on the plate, 0..1
  u: number;
  v: number;
  // position in canvas pixels
  x: number;
  y: number;
  angleJitter: number;
  cross: boolean;
  // longest tick that cannot touch a neighbour's tick
  maxLen: number;
}

interface Modes {
  n: number;
  m: number;
}

interface FieldSample {
  value: number;
  gx: number;
  gy: number;
}

// Square-plate Chladni mode family. A and B are the two degenerate (n, m)
// and (m, n) modes; the mix angle walks the figure through the family
// (θ = π/4 and 3π/4 are the classic A + B and A − B plates).
function chladni(u: number, v: number, { n, m }: Modes, theta: number): FieldSample {
  const pi = Math.PI;
  const cnu = Math.cos(n * pi * u);
  const snu = Math.sin(n * pi * u);
  const cmu = Math.cos(m * pi * u);
  const smu = Math.sin(m * pi * u);
  const cnv = Math.cos(n * pi * v);
  const snv = Math.sin(n * pi * v);
  const cmv = Math.cos(m * pi * v);
  const smv = Math.sin(m * pi * v);

  const ca = Math.cos(theta);
  const cb = Math.sin(theta);

  const a = cnu * cmv;
  const b = cmu * cnv;
  const aDu = -n * pi * snu * cmv;
  const aDv = -m * pi * cnu * smv;
  const bDu = -m * pi * smu * cnv;
  const bDv = -n * pi * cmu * snv;

  return {
    value: ca * a + cb * b,
    gx: ca * aDu + cb * bDu,
    gy: ca * aDv + cb * bDv,
  };
}

type SpatialGrid = ReturnType<typeof createSpatialGrid>;

function createSpatialGrid(cellSize: number) {
  const cells = new Map<string, Point[]>();

  function cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  function insert(x: number, y: number): void {
    const k = cellKey(Math.floor(x / cellSize), Math.floor(y / cellSize));
    const bucket = cells.get(k) ?? [];
    bucket.push({ x, y });
    cells.set(k, bucket);
  }

  // Nearest stored point other than (x, y) itself, searched one ring out.
  function nearestDist(x: number, y: number): number {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const p of cells.get(cellKey(cx + dx, cy + dy)) ?? []) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d > 0 && d < best) best = d;
        }
      }
    }
    return best;
  }

  return { insert, nearestDist };
}

function pickModes(): Modes {
  const n = Random.rangeFloor(1, 7);
  let m = Random.rangeFloor(2, 10);
  while (m === n) m = Random.rangeFloor(2, 10);
  return { n, m };
}

function buildSamples(width: number, height: number): Sample[] {
  const size = Math.min(width, height) - config.margin * 2;
  const x0 = (width - size) / 2;
  const y0 = (height - size) / 2;

  // Thin the jittered grid so no two samples sit closer than minSeparation.
  const grid: SpatialGrid = createSpatialGrid(config.spacing * 1.5);
  const accepted: Point[] = [];
  for (let gy = 0; gy <= size; gy += config.spacing) {
    for (let gx = 0; gx <= size; gx += config.spacing) {
      const x = clamp(gx + Random.range(-1, 1) * config.spacingJitter, 0, size);
      const y = clamp(gy + Random.range(-1, 1) * config.spacingJitter, 0, size);
      if (grid.nearestDist(x, y) < config.minSeparation) continue;
      grid.insert(x, y);
      accepted.push({ x, y });
    }
  }

  return accepted.map(({ x, y }) => {
    const neighborDist = grid.nearestDist(x, y);
    return {
      u: x / size,
      v: y / size,
      x: x0 + x,
      y: y0 + y,
      angleJitter: Random.range(-config.tickAngleJitter, config.tickAngleJitter),
      cross: Random.chance(config.crossChance),
      maxLen: Number.isFinite(neighborDist)
        ? neighborDist * config.tickNeighborMargin
        : config.tickLenMax,
    };
  });
}

function drawTicks(
  context: CanvasRenderingContext2D,
  samples: Sample[],
  modes: Modes,
  theta: number,
  plateSize: number,
): void {
  context.strokeStyle = config.fg;
  context.lineWidth = config.lineWidth;
  context.lineCap = 'round';
  context.beginPath();

  const segment = (x: number, y: number, angle: number, len: number) => {
    const hx = Math.cos(angle) * len * 0.5;
    const hy = Math.sin(angle) * len * 0.5;
    context.moveTo(x - hx, y - hy);
    context.lineTo(x + hx, y + hy);
  };

  for (const s of samples) {
    const f = chladni(s.u, s.v, modes, theta);
    // Gradient in pixels; |value| / |gradient| is the first-order distance to
    // the zero set, so tick length falls off with distance to the nodal line.
    const gx = f.gx / plateSize;
    const gy = f.gy / plateSize;
    const gMag = Math.hypot(gx, gy);
    const dist = gMag > 1e-9 ? Math.abs(f.value) / gMag : Infinity;
    if (dist < config.clearDist) continue;

    const t = clamp((dist - config.clearDist) / config.tickFalloffDist, 0, 1);
    const idealLen =
      config.tickLenMin + (config.tickLenMax - config.tickLenMin) * t ** config.tickFieldGamma;
    const len = Math.min(idealLen, s.maxLen);

    // The field is the gradient; ticks lie normal to it, along the level set.
    const gradAngle = Math.atan2(gy, gx);
    segment(s.x, s.y, gradAngle + Math.PI / 2 + s.angleJitter, len);
    if (s.cross) {
      segment(s.x, s.y, gradAngle, Math.min(len * config.crossLenScale, s.maxLen));
    }
  }

  context.stroke();
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
  const modes = pickModes();
  const samples = buildSamples(width, height);
  const plateSize = Math.min(width, height) - config.margin * 2;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    // θ and θ + π give ±u, the same nodal set, so half a turn loops cleanly.
    const theta = Math.PI / 4 + playhead * Math.PI;
    drawTicks(context, samples, modes, theta, plateSize);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 12000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
