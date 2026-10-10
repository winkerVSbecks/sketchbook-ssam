import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../../colors/riso';
import { createNaleeSystem } from '../nalee-system';
import { clipDomainWithWorldCoords } from '../domain';
import { xyToId } from '../utils';
import type { Config, DomainToWorld, Node, Walker } from '../types';

/**
 * bipolar — nalee pipe walkers on a bipolar grid. The cells are (τ, σ) steps
 * of bipolar coordinates around two foci: constant τ draws circles round each
 * focus, constant σ the arcs through both. The walker fills the cell grid
 * unchanged; only domainToWorld knows about the foci. Because the map is
 * conformal and Δτ = Δσ, every cell is square, so each path is drawn as a
 * solid band as wide as its own step (nalee's solidStyle, scaled per cell) —
 * the bands crowd and thin toward the two foci and swell where the grid runs
 * out toward the canvas edge.
 */

Random.setSeed(Random.getRandomSeed());

const SIGMA_RES = 64 * 2; // cells round each σ loop
const STEP = (Math.PI * 2) / SIGMA_RES; // Δσ = Δτ: square cells
const TAU_MAX = 2.5; // how close to the foci the grid reaches
const TAU_STEPS = Math.round(TAU_MAX / STEP); // per side of the τ = 0 axis
const MARGIN = 0.06; // of width, the ground left round the field

/** Bipolar → cartesian, foci at (±a, 0). */
const bipolarToXY = (a: number, tau: number, sigma: number): Point => {
  const d = Math.cosh(tau) - Math.cos(sigma);
  return [(a * Math.sinh(tau)) / d, (a * Math.sin(sigma)) / d];
};

/**
 * nalee's solidStyle, scaled: each path is one filled band in the walker's
 * colour, `SOLID` of the local cell width (the rest is the gap between
 * paths). The band is built as an outline, not stroked cell by cell: the
 * width comes from the exact bipolar scale factor at every sample, so it
 * swells and thins continuously, and big cells are sampled densely, so the
 * curve stays smooth where the grid is coarse.
 */
const SOLID = 0.78;
/** Target spacing of samples along a path, in px. */
const SAMPLE_PX = 3;

type GridLookup = (p: Point) => Point | undefined;
/** Local cell width (px) at a grid position. */
type CellWidth = (gx: number, gy: number) => number;
type Sample = { p: Point; w: number };

/** World samples along a path, following the true τ/σ curve with a continuous width. */
function sampleBand(
  pts: Point[],
  toGrid: GridLookup,
  toWorld: DomainToWorld,
  cellWidth: CellWidth,
): Sample[] {
  const out: Sample[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const ga = toGrid(a);
    const gb = toGrid(b);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!ga || !gb) {
      // Off the lookup (should not happen): fall back to the chord.
      if (i === 1) out.push({ p: a, w: len * SOLID });
      out.push({ p: b, w: len * SOLID });
      continue;
    }
    const steps = Math.max(2, Math.ceil(len / SAMPLE_PX));
    for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      const gx = ga[0] + (gb[0] - ga[0]) * t;
      const gy = ga[1] + (gb[1] - ga[1]) * t;
      out.push({ p: toWorld(gx, gy), w: cellWidth(gx, gy) * SOLID });
    }
  }
  return out;
}

/** Fill a variable-width band: offset outline plus round caps and joins. */
function fillBand(context: CanvasRenderingContext2D, band: Sample[]): void {
  const n = band.length;
  if (n < 2) return;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = band[Math.max(0, i - 1)].p;
    const next = band[Math.min(n - 1, i + 1)].p;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    const h = band[i].w / 2;
    const [x, y] = band[i].p;
    left.push([x + nx * h, y + ny * h]);
    right.push([x - nx * h, y - ny * h]);
  }
  context.beginPath();
  left.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
  for (let i = n - 1; i >= 0; i--) context.lineTo(right[i][0], right[i][1]);
  context.closePath();
  context.fill('nonzero');
  // Round caps, and discs at sharp turns so the outside of a corner stays round.
  for (let i = 0; i < n; i++) {
    const turn =
      i === 0 ||
      i === n - 1 ||
      (() => {
        const [ax, ay] = band[i - 1].p;
        const [bx, by] = band[i].p;
        const [cx, cy] = band[i + 1].p;
        const u = Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) || 1;
        return ((bx - ax) * (cx - bx) + (by - ay) * (cy - by)) / u < 0.9;
      })();
    if (!turn) continue;
    context.beginPath();
    context.arc(band[i].p[0], band[i].p[1], band[i].w / 2, 0, Math.PI * 2);
    context.fill();
  }
}

const scaledSolid =
  (toGrid: GridLookup, toWorld: DomainToWorld, cellWidth: CellWidth) =>
  (context: CanvasRenderingContext2D, walker: Walker, pts: Point[]) => {
    if (pts.length < 2) return;
    context.fillStyle = walker.color;
    fillBand(context, sampleBand(pts, toGrid, toWorld, cellWidth));
  };

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const riso = randomPalette();
  const bg = riso.bg;
  const inkColors = Random.shuffle(riso.inkColors).slice(0, 4) as string[];
  console.log('bg', bg, 'inks', inkColors);

  const a = width * 0.24; // focal half-distance in px
  const [cx, cy] = [width / 2, height / 2];

  // Grid x ↔ τ (−TAU_MAX … TAU_MAX), grid y ↔ σ (−π … π). σ's seam at ±π
  // lies on the segment between the foci and is left unjoined.
  const domainToWorld: DomainToWorld = (x, y) => {
    const [px, py] = bipolarToXY(a, (x - TAU_STEPS) * STEP, -Math.PI + (y + 0.5) * STEP);
    return [cx + px, cy + py];
  };
  // Bipolar coordinates are conformal with scale factor a / (cosh τ − cos σ),
  // so a cell's side length is exactly that times STEP, anywhere on the grid.
  const cellWidth: CellWidth = (x, y) =>
    (a * STEP) / (Math.cosh((x - TAU_STEPS) * STEP) - Math.cos(-Math.PI + (y + 0.5) * STEP));

  const nodes: Node[] = [];
  for (let y = 0; y < SIGMA_RES; y++) {
    for (let x = 0; x <= TAU_STEPS * 2; x++) {
      const [worldX, worldY] = domainToWorld(x, y);
      nodes.push({ x, y, occupied: false, id: xyToId(x, y), worldX, worldY });
    }
  }
  // σ near 0 with τ near 0 runs off to infinity: keep only what lands on the sheet.
  const m = width * MARGIN;
  const sheet: Point[] = [
    [m, m],
    [width - m, m],
    [width - m, height - m],
    [m, height - m],
  ];
  const domain = clipDomainWithWorldCoords(nodes, sheet);
  // nalee hands the path style world points; look their cells back up so
  // each step can be traced along its curve rather than its chord.
  const byWorld = new Map(domain.map((n) => [`${n.worldX},${n.worldY}`, [n.x, n.y] as Point]));
  const toGrid: GridLookup = ([x, y]) => byWorld.get(`${x},${y}`);

  const config = {
    resolution: [TAU_STEPS * 2, SIGMA_RES - 1],
    size: 1,
    stepSize: 1,
    walkerCount: 24,
    padding: 0,
    pathStyle: scaledSolid(toGrid, domainToWorld, cellWidth),
    flat: true,
  } satisfies Config;

  const naleeSystem = createNaleeSystem(domain, config, domainToWorld, inkColors, bg);

  wrap.render = (frame: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    naleeSystem(frame);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
