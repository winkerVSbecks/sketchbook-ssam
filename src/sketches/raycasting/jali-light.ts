import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { wcagLuminance } from 'culori';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { palettes as autoAlbers } from '../../colors/auto-albers';

// raycasting/grid's light, but the walls are a jali: a band of
// jali/truchet's staircase tiles across the top of the floor. The emitter sits
// behind the screen, off the canvas, and slides along it on the playhead; the
// image is the pattern of light the screen throws on the floor below.

type Vec = [number, number];

interface Wall {
  a: Vec;
  b: Vec;
}

const config = {
  seed: 31,
  tile: 44,
  rows: 3,
  bandTop: 150,
  emitterY: -320,
  sweep: 0.42, // fraction of width the emitter travels either side of centre
  screenWidth: 3.5,
};

Random.setSeed(config.seed);

// Darkest colour is the floor in shadow, lightest is the light, and the
// screen takes the one in between that sits furthest from both.
const source = Random.pick(
  [...mindfulPalettes, ...autoAlbers].filter((p) => p.length >= 3),
);
const byLum = [...source].sort((a, b) => wcagLuminance(a) - wcagLuminance(b));
const shadow = byLum[0];
const light = byLum[byLum.length - 1];
const screen = byLum[Math.floor(byLum.length / 2)];

// jali/truchet's four staircase tiles, unit-square coordinates in quarters.
const tiles: Vec[][] = [
  [[0, 4], [1, 3], [1, 2], [2, 2], [3, 2], [3, 1], [4, 0]],
  [[0, 0], [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [4, 4]],
  [[0, 4], [1, 3], [2, 3], [2, 2], [2, 1], [3, 1], [4, 0]],
  [[0, 0], [1, 1], [1, 2], [2, 2], [3, 2], [3, 3], [4, 4]],
];

function buildScreen(width: number): Wall[] {
  const { tile, rows, bandTop } = config;
  const s = tile / 4;
  const walls: Wall[] = [];
  // The band overhangs the canvas so all light reaching the floor passes through it.
  const x0 = -tile * 12;
  const cols = Math.ceil((width - x0 * 2) / tile);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = x0 + c * tile;
      const oy = bandTop + r * tile;
      // Pull both ends half a step in from the tile corners: the lattice is
      // pierced at every vertex, so light can pass.
      const raw = (Random.pick(tiles) as Vec[]).map(([dx, dy]): Vec => [ox + dx * s, oy + dy * s]);
      const mid = (p: Vec, q: Vec): Vec => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const n = raw.length;
      const pts = [mid(raw[0], raw[1]), ...raw.slice(1, -1), mid(raw[n - 1], raw[n - 2])];
      for (let i = 1; i < pts.length; i++) walls.push({ a: pts[i - 1], b: pts[i] });
    }
  }
  return walls;
}

// Distance along the ray (origin o, direction d) to the wall, or Infinity.
function hit(o: Vec, d: Vec, w: Wall): number {
  const ex = w.b[0] - w.a[0];
  const ey = w.b[1] - w.a[1];
  const den = d[0] * ey - d[1] * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const qx = w.a[0] - o[0];
  const qy = w.a[1] - o[1];
  const t = (qx * ey - qy * ex) / den; // along the ray
  const u = (qx * d[1] - qy * d[0]) / den; // along the wall
  return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
}

// Exact visibility polygon: a ray at every wall endpoint and just either side
// of it, closest hit per ray, sorted by angle.
function visibility(o: Vec, walls: Wall[]): Vec[] {
  const angles: number[] = [];
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const a = Math.atan2(p[1] - o[1], p[0] - o[0]);
      angles.push(a - 1e-5, a, a + 1e-5);
    }
  }
  angles.sort((x, y) => x - y);
  const poly: Vec[] = [];
  for (const a of angles) {
    const d: Vec = [Math.cos(a), Math.sin(a)];
    let best = Infinity;
    for (const w of walls) best = Math.min(best, hit(o, d, w));
    if (Number.isFinite(best)) poly.push([o[0] + d[0] * best, o[1] + d[1] * best]);
  }
  return poly;
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  const screenWalls = buildScreen(width);
  // A room far larger than the canvas closes every ray.
  const R = 4000;
  const room: Wall[] = [
    { a: [-R, -R], b: [R, -R] },
    { a: [R, -R], b: [R, R] },
    { a: [R, R], b: [-R, R] },
    { a: [-R, R], b: [-R, -R] },
  ];
  const walls = [...screenWalls, ...room];

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const ex = width / 2 + Math.sin(playhead * Math.PI * 2) * width * config.sweep;
    const emitter: Vec = [ex, config.emitterY];

    context.fillStyle = shadow;
    context.fillRect(0, 0, width, height);

    const poly = visibility(emitter, walls);
    context.fillStyle = light;
    context.beginPath();
    poly.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
    context.closePath();
    context.fill();

    context.strokeStyle = screen;
    context.lineWidth = config.screenWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (const w of screenWalls) {
      context.moveTo(w.a[0], w.a[1]);
      context.lineTo(w.b[0], w.b[1]);
    }
    context.stroke();
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
