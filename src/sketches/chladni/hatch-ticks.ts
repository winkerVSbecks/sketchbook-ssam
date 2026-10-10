import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

// A Chladni plate drawn the way electric-field/hatch-field draws a dipole:
// only short ticks, laid along the contours of the standing wave, their
// length falling with the amplitude so the nodal lines show as gaps.

interface Tick {
  x: number;
  y: number;
  angle: number;
  len: number;
}

const config = {
  seed: 23,
  a: 1,
  b: 1,
  margin: 90,
  spacing: 8,
  jitter: 2.6,
  tickLenMin: 2.2,
  tickLenMax: 10,
  gamma: 0.6,
  angleJitter: 0.06,
  neighborMargin: 0.9,
  crossChance: 0.12,
  crossLenScale: 0.5,
  lineWidth: 1,
  bg: '#ffffff',
  fg: '#111111',
};

Random.setSeed(config.seed);
const n = Random.rangeFloor(3, 9);
let m = Random.rangeFloor(3, 9);
while (m === n) m = Random.rangeFloor(3, 9);

function chladni(x: number, y: number): number {
  return (
    config.a * Math.sin(Math.PI * n * x) * Math.sin(Math.PI * m * y) +
    config.b * Math.sin(Math.PI * m * x) * Math.sin(Math.PI * n * y)
  );
}

// Analytic gradient of the closed form in unit-plate coordinates.
function gradient(x: number, y: number): [number, number] {
  const p = Math.PI;
  const gx =
    config.a * p * n * Math.cos(p * n * x) * Math.sin(p * m * y) +
    config.b * p * m * Math.cos(p * m * x) * Math.sin(p * n * y);
  const gy =
    config.a * p * m * Math.sin(p * n * x) * Math.cos(p * m * y) +
    config.b * p * n * Math.sin(p * m * x) * Math.cos(p * n * y);
  return [gx, gy];
}

// Spatial hash of sample points, as in hatch-field, so a tick is capped
// before it can reach its neighbour.
function createSpatialGrid(cellSize: number) {
  const cells = new Map<string, [number, number][]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  function insert(x: number, y: number): void {
    const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize));
    const bucket = cells.get(k) ?? [];
    bucket.push([x, y]);
    cells.set(k, bucket);
  }
  function nearestDist(x: number, y: number): number {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const [px, py] of cells.get(key(cx + dx, cy + dy)) ?? []) {
          const d = Math.hypot(px - x, py - y);
          if (d > 1e-6 && d < best) best = d;
        }
      }
    }
    return best;
  }
  return { insert, nearestDist };
}

function buildTicks(width: number, height: number): Tick[] {
  const { margin, spacing, jitter } = config;
  const size = Math.min(width, height) - margin * 2;
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;

  const samples: [number, number][] = [];
  for (let y = oy + spacing / 2; y < oy + size; y += spacing) {
    for (let x = ox + spacing / 2; x < ox + size; x += spacing) {
      samples.push([x + Random.range(-jitter, jitter), y + Random.range(-jitter, jitter)]);
    }
  }
  const grid = createSpatialGrid(spacing * 1.5);
  for (const [x, y] of samples) grid.insert(x, y);

  // Normalise by the loudest sample so the antinodes reach full tick length
  let peak = 1e-6;
  for (const [x, y] of samples) peak = Math.max(peak, Math.abs(chladni((x - ox) / size, (y - oy) / size)));

  const ticks: Tick[] = [];
  for (const [x, y] of samples) {
    const u = (x - ox) / size;
    const v = (y - oy) / size;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;

    // |amplitude| normalised to 0..1
    const amp = Math.min(1, Math.abs(chladni(u, v)) / peak);
    const len0 = config.tickLenMax * amp ** config.gamma;
    if (len0 < config.tickLenMin) continue;

    const [gx, gy] = gradient(u, v);
    // Along the contour: perpendicular to the gradient
    const angle = Math.atan2(gy, gx) + Math.PI / 2 + Random.range(-config.angleJitter, config.angleJitter);
    const len = Math.min(len0, grid.nearestDist(x, y) * config.neighborMargin);
    ticks.push({ x, y, angle, len });

    if (Random.chance(config.crossChance)) {
      ticks.push({ x, y, angle: angle - Math.PI / 2, len: len * config.crossLenScale });
    }
  }
  return ticks;
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  const ticks = buildTicks(width, height);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = config.fg;
    context.lineWidth = config.lineWidth;
    context.lineCap = 'round';
    context.beginPath();
    for (const t of ticks) {
      const hx = Math.cos(t.angle) * t.len * 0.5;
      const hy = Math.sin(t.angle) * t.len * 0.5;
      context.moveTo(t.x - hx, t.y - hy);
      context.lineTo(t.x + hx, t.y + hy);
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
