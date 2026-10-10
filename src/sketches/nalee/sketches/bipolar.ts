import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../../colors';
import { contrastRatio } from '../../../tui';
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
 *
 * Two colours, high contrast: the most contrasting pair of a random palette,
 * one ink on one ground. Every parameter lives in the tweakpane; changing one
 * rebuilds the grid and re-walks it from the same seed.
 */

interface Params {
  /** Cells round each σ loop; Δσ = Δτ = 2π / sigmaRes keeps cells square. */
  sigmaRes: number;
  /** How close to the foci the grid reaches (τ extent each side). */
  tauMax: number;
  /** Focal half-distance, as a fraction of the canvas width. */
  focal: number;
  /** Ground left round the field, as a fraction of the canvas width. */
  margin: number;
  walkers: number;
  /** Share of the local cell width that is ink; the rest is the gap. */
  solid: number;
  /** Swap ink and ground. */
  invert: boolean;
  seed: string;
}

const params: Params = {
  sigmaRes: 128,
  tauMax: 2.5,
  focal: 0.24,
  margin: 0.06,
  walkers: 24,
  solid: 0.78,
  invert: false,
  seed: Random.getRandomSeed(),
};

/** Below this the pair is re-drawn from another palette (WCAG ratio). */
const MIN_CONTRAST = 7;

/** The two most contrasting colours of a random palette, trying a few palettes for ≥ MIN_CONTRAST. */
function contrastPair(): [string, string] {
  let best: [string, string] = ['#ffffff', '#000000'];
  let bestRatio = 0;
  for (let attempt = 0; attempt < 24 && bestRatio < MIN_CONTRAST; attempt++) {
    const palette = randomPalette();
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const r = contrastRatio(palette[i], palette[j]);
        if (r > bestRatio) {
          bestRatio = r;
          best = [palette[i], palette[j]];
        }
      }
    }
  }
  return best;
}

/** Bipolar → cartesian, foci at (±a, 0). */
const bipolarToXY = (a: number, tau: number, sigma: number): Point => {
  const d = Math.cosh(tau) - Math.cos(sigma);
  return [(a * Math.sinh(tau)) / d, (a * Math.sin(sigma)) / d];
};

/**
 * nalee's solidStyle, scaled: each path is one filled band in the walker's
 * colour, `params.solid` of the local cell width (the rest is the gap between
 * paths). The band is built as an outline, not stroked cell by cell: the
 * width comes from the exact bipolar scale factor at every sample, so it
 * swells and thins continuously, and big cells are sampled densely, so the
 * curve stays smooth where the grid is coarse.
 */
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
      if (i === 1) out.push({ p: a, w: len * params.solid });
      out.push({ p: b, w: len * params.solid });
      continue;
    }
    const steps = Math.max(2, Math.ceil(len / SAMPLE_PX));
    for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      const gx = ga[0] + (gb[0] - ga[0]) * t;
      const gy = ga[1] + (gb[1] - ga[1]) * t;
      out.push({ p: toWorld(gx, gy), w: cellWidth(gx, gy) * params.solid });
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
  const pane = new Pane({ title: 'bipolar' }) as any;
  pane.element.parentElement.style.zIndex = '1';

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      pane.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const colors = { ink: '#000000', ground: '#ffffff' };
  const [cx, cy] = [width / 2, height / 2];
  let draw: (frame: SketchProps) => void = () => {};

  const dealPalette = () => {
    const [p, q] = contrastPair();
    // Lighter colour as ground by default; `invert` swaps them.
    const [light, dark] = contrastRatio(p, '#ffffff') < contrastRatio(q, '#ffffff') ? [p, q] : [q, p];
    colors.ground = light;
    colors.ink = dark;
  };

  /** Rebuild the grid, its clip and the walkers from `params`. */
  const build = () => {
    Random.setSeed(params.seed);
    const step = (Math.PI * 2) / params.sigmaRes;
    const tauSteps = Math.max(1, Math.round(params.tauMax / step));
    const a = width * params.focal;
    const ink = params.invert ? colors.ground : colors.ink;
    const ground = params.invert ? colors.ink : colors.ground;

    // Grid x ↔ τ (−tauMax … tauMax), grid y ↔ σ (−π … π). σ's seam at ±π
    // lies on the segment between the foci and is left unjoined.
    const domainToWorld: DomainToWorld = (x, y) => {
      const [px, py] = bipolarToXY(a, (x - tauSteps) * step, -Math.PI + (y + 0.5) * step);
      return [cx + px, cy + py];
    };
    // Bipolar coordinates are conformal with scale factor a / (cosh τ − cos σ),
    // so a cell's side length is exactly that times the step, anywhere.
    const cellWidth: CellWidth = (x, y) =>
      (a * step) / (Math.cosh((x - tauSteps) * step) - Math.cos(-Math.PI + (y + 0.5) * step));

    const nodes: Node[] = [];
    for (let y = 0; y < params.sigmaRes; y++) {
      for (let x = 0; x <= tauSteps * 2; x++) {
        const [worldX, worldY] = domainToWorld(x, y);
        nodes.push({ x, y, occupied: false, id: xyToId(x, y), worldX, worldY });
      }
    }
    // σ near 0 with τ near 0 runs off to infinity: keep only what lands on the sheet.
    const m = width * params.margin;
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
      resolution: [tauSteps * 2, params.sigmaRes - 1],
      size: 1,
      stepSize: 1,
      walkerCount: params.walkers,
      padding: 0,
      pathStyle: scaledSolid(toGrid, domainToWorld, cellWidth),
      flat: true,
    } satisfies Config;

    const naleeSystem = createNaleeSystem(domain, config, domainToWorld, [ink], ground);
    draw = (frame) => {
      context.fillStyle = ground;
      context.fillRect(0, 0, width, height);
      naleeSystem(frame);
    };
  };

  const rebuild = () => {
    build();
    props.render();
  };

  // ─── Pane ────────────────────────────────────────────────────────────────────

  // Rebuild on the editable inputs only, once a drag settles. A pane-wide
  // 'change' listener would also hear the read-only monitors, which poll —
  // and a rebuild per poll never lets the page go idle.
  const onInput = (binding: any) =>
    binding.on('change', (ev: { last?: boolean }) => {
      if (ev.last !== false) rebuild();
    });

  const grid = pane.addFolder({ title: 'Grid' });
  onInput(grid.addBinding(params, 'sigmaRes', { min: 24, max: 240, step: 4, label: 'resolution' }));
  onInput(grid.addBinding(params, 'tauMax', { min: 0.8, max: 4, step: 0.1, label: 'reach (τ)' }));
  onInput(grid.addBinding(params, 'focal', { min: 0.05, max: 0.45, step: 0.01, label: 'foci apart' }));
  onInput(grid.addBinding(params, 'margin', { min: 0, max: 0.2, step: 0.005 }));

  const paths = pane.addFolder({ title: 'Paths' });
  onInput(paths.addBinding(params, 'walkers', { min: 1, max: 80, step: 1 }));
  onInput(paths.addBinding(params, 'solid', { min: 0.05, max: 1, step: 0.01, label: 'line (× cell)' }));

  const colour = pane.addFolder({ title: 'Colour' });
  colour.addBinding(colors, 'ink', { readonly: true });
  colour.addBinding(colors, 'ground', { readonly: true });
  onInput(colour.addBinding(params, 'invert'));
  colour.addButton({ title: 'New palette' }).on('click', () => {
    dealPalette();
    pane.refresh();
    rebuild();
  });

  pane.addBinding(params, 'seed', { readonly: true });
  pane.addButton({ title: 'Regenerate' }).on('click', () => {
    params.seed = Random.getRandomSeed();
    pane.refresh();
    rebuild();
  });

  dealPalette();
  build();

  wrap.render = (frame: SketchProps) => {
    draw(frame);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  // Nothing moves: the image is redrawn when the pane changes.
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
