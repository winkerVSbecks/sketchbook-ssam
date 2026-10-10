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

const SIGMA_RES = 64; // cells round each σ loop
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
 * nalee's solidStyle, scaled: one stroke in the walker's colour, drawn segment
 * by segment so each piece is as wide as its own cell. `SOLID` of the cell
 * width is ink; the rest is the gap that keeps neighbouring paths apart.
 */
const SUBSTEPS = 6; // each cell step traced along the true τ/σ curve
const SOLID = 0.78;

type GridLookup = (p: Point) => Point | undefined;

const scaledSolid =
  (toGrid: GridLookup, toWorld: DomainToWorld) =>
  (context: CanvasRenderingContext2D, walker: Walker, pts: Point[]) => {
    if (pts.length < 2) return;
    const segs = pts.slice(1).map((b, i) => {
      const a = pts[i];
      const ga = toGrid(a);
      const gb = toGrid(b);
      const curve: Point[] =
        ga && gb
          ? Array.from({ length: SUBSTEPS + 1 }, (_, k) => {
              const t = k / SUBSTEPS;
              return toWorld(ga[0] + (gb[0] - ga[0]) * t, ga[1] + (gb[1] - ga[1]) * t);
            })
          : [a, b];
      return { curve, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    });
    context.setLineDash([]);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = walker.color;
    for (const s of segs) {
      context.lineWidth = s.len * SOLID;
      context.beginPath();
      s.curve.forEach(([x, y], k) => (k ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.stroke();
    }
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
    pathStyle: scaledSolid(toGrid, domainToWorld),
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
