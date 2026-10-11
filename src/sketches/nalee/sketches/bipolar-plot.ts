import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../../colors';
import { contrastRatio } from '../../../tui';
import { getDimensionsFromPreset } from '../../../penplot/distances';
import { setupPenplotExport } from '../../../penplot/render-penplot';
import { createNaleeSystem } from '../nalee-system';
import { walkerToPaths } from '../walker';
import { clipDomainWithWorldCoords } from '../domain';
import { xyToId } from '../utils';
import type { Config, DomainToWorld, Node } from '../types';

/**
 * bipolar-plot — fork of bipolar for the pen plotter: the gap between paths
 * is a fixed width in millimetres on the plotted sheet, everywhere, so every
 * gap plots the same. Each band is its cell minus the gap.
 *
 * Cells near the foci (and along the segment between them) are smaller than
 * a gap plus a pen, so a single grid leaves them empty. The grid here is
 * multi-level instead: a quadtree over (τ, σ) whose coarse cells split only
 * while every child stays at least gap + minLine pens wide. Each level is
 * walked by its own nalee system, so the middle fills with wider paths and
 * the outer field keeps the full resolution.
 *
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
 *
 * Plotting: the square drawing is fitted inside the chosen sheet's margin and
 * written as an SVG in centimetres, one layer in the ink colour, at the pen
 * width. `fill` lays pen-spaced strokes along each band so it plots solid,
 * `outline` traces each band, `centre` draws one line per path. "Preview
 * plot" shows those exact lines on screen. Cmd/Ctrl+S or "Save SVG" writes it.
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
  /** Smallest line the grid may produce, in pens: cells coarsen below gap + this. */
  minLine: number;

  /** Gap between neighbouring paths on the plotted sheet, mm. */
  gapMm: number;
  /** Swap ink and ground. */
  invert: boolean;
  seed: string;
  /** Plot: sheet, bare border (cm), pen tip (mm), what the pen draws, and whether the screen shows it. */
  paper: 'a5' | 'a4' | 'a3';
  plotMargin: number;
  penMm: number;
  plotMode: PlotMode;
  preview: boolean;
}

const params: Params = {
  sigmaRes: 128,
  tauMax: 8,
  focal: 0.24,
  margin: 0.06,
  walkers: 24,
  minLine: 1.5,
  gapMm: 0.8,
  invert: false,
  seed: Random.getRandomSeed(),
  paper: 'a4',
  plotMargin: 2,
  penMm: 0.5,
  plotMode: 'fill',
  preview: false,
};

const UNITS = 'cm';

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
 * nalee's solidStyle, scaled: each path is one band, a share of the local
 * cell width (the rest is the gap between paths). Here the share is
 * 1 − gap / cell, so the gap is a constant `gapMm` on the plotted sheet. The band is built from the walker's grid path
 * directly: every turn is rounded to a quarter arc of radius share / 2 cells (so the inner edge closes to a point instead
 * of looping), then the path is sampled ~3px apart along the true τ/σ curve,
 * each sample carrying the exact local width. The same samples fill the
 * screen band and generate the plotter lines.
 */
/** Target spacing of samples along a path, in px. */
const SAMPLE_PX = 3;
/** Points per rounded corner. */
const ARC_STEPS = 10;

/** Local cell width (px) at a grid position. */
type CellWidth = (gx: number, gy: number) => number;
/** Share of the cell that is ink at a grid column (it depends on τ only). */
type LineShare = (gx: number, gy: number) => number;
interface Sample {
  p: Point;
  /** band width, px */
  w: number;
  /** unit normal (left of travel) */
  n: Point;
  /** unit tangent */
  t: Point;
}
type Band = Sample[];
type PlotMode = 'fill' | 'outline' | 'centre';

const sign = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.sign(v));

/** Grid path → the same path with each turn rounded to a quarter arc of half the local share. */
function filletGrid(pts: Point[], share: LineShare): Point[] {
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [qx, qy] = pts[i + 1];
    const d1: Point = [sign(cx - px), sign(cy - py)];
    const d2: Point = [sign(qx - cx), sign(qy - cy)];
    // Straight on, or not a clean right angle: keep the vertex.
    if (d1[0] * d2[0] + d1[1] * d2[1] !== 0 || Math.abs(d1[0]) + Math.abs(d1[1]) !== 1) {
      out.push(pts[i]);
      continue;
    }
    // Radius half the band there, so the inner edge closes to a point.
    const r = share(cx, cy) / 2;
    if (r <= 0) {
      out.push(pts[i]);
      continue;
    }
    // Centre inside the corner; the arc runs from (c − d1·r) to (c + d2·r).
    const ox = cx - d1[0] * r + d2[0] * r;
    const oy = cy - d1[1] * r + d2[1] * r;
    for (let k = 0; k <= ARC_STEPS; k++) {
      const th = (k / ARC_STEPS) * (Math.PI / 2);
      out.push([
        ox - d2[0] * r * Math.cos(th) + d1[0] * r * Math.sin(th),
        oy - d2[1] * r * Math.cos(th) + d1[1] * r * Math.sin(th),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Sample a grid polyline ~SAMPLE_PX apart in world space, with width and frame at each sample. */
function sampleBand(
  grid: Point[],
  toWorld: DomainToWorld,
  cellWidth: CellWidth,
  share: LineShare,
): Band {
  const raw: { p: Point; w: number }[] = [];
  const push = (gx: number, gy: number) => {
    const p = toWorld(gx, gy);
    const last = raw[raw.length - 1];
    if (last && Math.hypot(p[0] - last.p[0], p[1] - last.p[1]) < 1e-6) return;
    raw.push({ p, w: cellWidth(gx, gy) * share(gx, gy) });
  };
  push(grid[0][0], grid[0][1]);
  for (let i = 1; i < grid.length; i++) {
    const [ax, ay] = grid[i - 1];
    const [bx, by] = grid[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    // March in grid units, stepping SAMPLE_PX of world length at a time.
    for (let t = 0; ; ) {
      t += SAMPLE_PX / cellWidth(ax + (bx - ax) * t, ay + (by - ay) * t) / len;
      if (t >= 1) break;
      push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
    push(bx, by);
  }
  return raw.map(({ p, w }, i) => {
    const prev = raw[Math.max(0, i - 1)].p;
    const next = raw[Math.min(raw.length - 1, i + 1)].p;
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const d = Math.hypot(dx, dy) || 1;
    return { p, w, t: [dx / d, dy / d], n: [-dy / d, dx / d] };
  });
}

const offset = (s: Sample, k: number): Point => [s.p[0] + s.n[0] * k, s.p[1] + s.n[1] * k];

/** Half-width of a band's edge, pulled in by `inset` (never past the centre line). */
const half = (s: Sample, inset: number) => Math.max(0, s.w / 2 - inset);

/** Semicircle round a band end, from the left edge to the right edge through the tip. */
function cap(s: Sample, dir: 1 | -1, inset: number): Point[] {
  const h = half(s, inset);
  return Array.from({ length: 9 }, (_, k) => {
    const th = (k / 8) * Math.PI;
    const c = Math.cos(th);
    const sn = Math.sin(th) * dir;
    const side = dir === 1 ? 1 : -1;
    return [
      s.p[0] + (s.n[0] * c * side + s.t[0] * sn) * h,
      s.p[1] + (s.n[1] * c * side + s.t[1] * sn) * h,
    ] as Point;
  });
}

/**
 * The band's closed outline: left edge, end cap, right edge back, start cap.
 * `inset` pulls it inside the band — for the plotter, half the pen, so the
 * ink stays within the band and the gap between paths stays open.
 */
function outline(band: Band, inset = 0): Point[] {
  const left = band.map((s) => offset(s, half(s, inset)));
  const right = band.map((s) => offset(s, -half(s, inset))).reverse();
  return [
    ...left,
    ...cap(band[band.length - 1], 1, inset),
    ...right,
    ...cap(band[0], -1, inset),
    left[0],
  ];
}

/** Fill a band on screen. */
function fillBand(context: CanvasRenderingContext2D, band: Band): void {
  if (band.length < 2) return;
  const pts = outline(band);
  context.beginPath();
  pts.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
  context.closePath();
  context.fill('nonzero');
}

/**
 * The lines a plotter draws for one band, in px. `fill` traces the band's
 * outline half a pen inside its edge (crisp edges, round ends, gaps kept
 * open) and lays pen-spaced strokes inside it;
 * the stroke count follows the local width, so where a band narrows toward
 * a focus strokes drop out instead of converging and over-inking the paper.
 * `outline` is the edge alone, `centre` one line down the middle.
 */
/**
 * The parts of a band at least a pen wide. A narrower stretch can't be drawn
 * without the pen spilling over the fixed gap (near the foci that merges the
 * paths into blots), so it is left off the plot.
 */
function plottable(band: Band, penPx: number): Band[] {
  const runs: Band[] = [];
  let run: Sample[] = [];
  for (const s of band) {
    if (s.w >= penPx) run.push(s);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

function plotLines(band: Band, mode: PlotMode, penPx: number): Point[][] {
  if (band.length < 2) return [];
  if (mode === 'centre') return [band.map((s) => s.p)];
  // A band no wider than the pen is one stroke down its middle.
  if (Math.max(...band.map((s) => s.w)) <= penPx) return [band.map((s) => s.p)];
  const edge = outline(band, penPx / 2);
  if (mode === 'outline') return [edge];

  // Inside the outline: strokes at pen spacing across (w − pen), counted per sample.
  const inner = (w: number) => Math.max(0, Math.ceil((w - penPx) / penPx) - 1);
  const lines: Point[][] = [edge];
  let start = 0;
  for (let i = 1; i <= band.length; i++) {
    if (i < band.length && inner(band[i].w) === inner(band[start].w)) continue;
    // One run of equal count; share its boundary sample with the next run.
    const run = band.slice(start, Math.min(band.length, i + 1));
    const k = inner(band[start].w);
    for (let j = 1; j <= k; j++) {
      const u = j / (k + 1) - 0.5;
      const line = run.map((s) => offset(s, u * Math.max(0, s.w - penPx)));
      // Boustrophedon: alternate direction so the pen does not travel back.
      lines.push(j % 2 ? line : line.reverse());
    }
    start = i;
  }
  // The strokes stop square at each end; nested arcs fill the round cap.
  for (const [s, dir] of [
    [band[band.length - 1], 1],
    [band[0], -1],
  ] as const) {
    for (let inset = penPx * 1.5; half(s, inset) > 0; inset += penPx) {
      lines.push(cap(s, dir, inset));
    }
  }
  return lines;
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  const pane = new Pane({ title: 'bipolar-plot' }) as any;
  pane.element.parentElement.style.zIndex = '1';

  const colors = { ink: '#000000', ground: '#ffffff' };
  const [cx, cy] = [width / 2, height / 2];
  /** Every path as a sampled band, in canvas px. */
  let bands: Band[] = [];

  // ─── Sheet mapping: the square drawing, centred inside the sheet's margin ────

  const sheet = () => {
    const [pw, ph] = getDimensionsFromPreset(params.paper, UNITS) as [number, number];
    const size = Math.min(pw, ph) - params.plotMargin * 2;
    const scale = size / width; // cm per px
    return { pw, ph, scale, ox: (pw - size) / 2, oy: (ph - size) / 2 };
  };
  const penPx = () => params.penMm / 10 / sheet().scale;

  const plot = (): Point[][] =>
    bands.flatMap((b) =>
      plottable(b, penPx()).flatMap((run) => plotLines(run, params.plotMode, penPx())),
    );

  const buildSvg = (): string => {
    const { pw, ph, scale, ox, oy } = sheet();
    const ink = params.invert ? colors.ground : colors.ink;
    const f = (v: number) => +v.toFixed(4);
    const d = plot()
      .filter((line) => line.length > 1)
      .map((line) => 'M' + line.map(([x, y]) => `${f(ox + x * scale)} ${f(oy + y * scale)}`).join('L'))
      .join('');
    return (
      `<?xml version="1.0" standalone="no"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `width="${pw}${UNITS}" height="${ph}${UNITS}" viewBox="0 0 ${pw} ${ph}">\n` +
      `  <g inkscape:groupmode="layer" inkscape:label="1-ink" id="ink">\n` +
      `    <path d="${d}" fill="none" stroke="${ink}" stroke-width="${params.penMm / 10}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>\n` +
      `  </g>\n</svg>\n`
    );
  };

  const cleanupExport = setupPenplotExport(settings, buildSvg);
  const saveSvg = () =>
    import.meta.hot?.send('ssam:export-svg', {
      svg: buildSvg(),
      filename: `bipolar-plot-${params.seed}-${params.plotMode}-${params.paper}`,
    });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanupExport();
      pane.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const dealPalette = () => {
    const [p, q] = contrastPair();
    // Lighter colour as ground by default; `invert` swaps them.
    const [light, dark] = contrastRatio(p, '#ffffff') < contrastRatio(q, '#ffffff') ? [p, q] : [q, p];
    colors.ground = light;
    colors.ink = dark;
  };

  /** Rebuild the multi-level grid, its walks and their bands from `params`. */
  const build = () => {
    Random.setSeed(params.seed);
    const step = (Math.PI * 2) / params.sigmaRes;
    const a = width * params.focal;
    const { scale } = sheet();
    // The gap is fixed on paper: convert mm → canvas px through the sheet.
    const gapPx = params.gapMm / 10 / scale;
    const penPxNow = params.penMm / 10 / scale;
    const minCell = gapPx + params.minLine * penPxNow;

    // Levels: level k has step·2^k. The top level keeps at least 4 σ cells.
    const top = Math.max(0, Math.min(6, Math.floor(Math.log2(params.sigmaRes / 4))));
    const stepOf = (k: number) => step * 2 ** k;
    const size = (k: number, i: number, j: number) => {
      const s = stepOf(k);
      const tau = (i + 0.5) * s;
      const sigma = -Math.PI + (j + 0.5) * s;
      return (a * s) / (Math.cosh(tau) - Math.cos(sigma));
    };

    // How far toward the foci the grid can go: past the τ where even a top
    // cell (worst case σ = π, cell = a·s / (cosh τ + 1)) drops below minCell,
    // nothing fits. `reach (τ)` can stop it sooner.
    const tauFit = Math.acosh(Math.max(1, (a * stepOf(top)) / minCell - 1));
    const tauLimit = Math.min(params.tauMax, tauFit);

    // Quadtree over (τ, σ): split a cell while all four children stay ≥ minCell.
    const leaves: [number, number][][] = Array.from({ length: top + 1 }, () => []);
    const visit = (k: number, i: number, j: number) => {
      const tauC = (i + 0.5) * stepOf(k);
      if (Math.abs(tauC) > tauLimit) return;
      if (k > 0) {
        const kids: [number, number][] = [
          [i * 2, j * 2],
          [i * 2 + 1, j * 2],
          [i * 2, j * 2 + 1],
          [i * 2 + 1, j * 2 + 1],
        ];
        if (kids.every(([ci, cj]) => size(k - 1, ci, cj) >= minCell)) {
          for (const [ci, cj] of kids) visit(k - 1, ci, cj);
          return;
        }
      }
      leaves[k].push([i, j]);
    };
    const nTop = Math.ceil(tauLimit / stepOf(top));
    const rowsTop = Math.round(params.sigmaRes / 2 ** top);
    for (let i = -nTop; i < nTop; i++) for (let j = 0; j < rowsTop; j++) visit(top, i, j);

    // σ near 0 with τ near 0 runs off to infinity: keep only what lands on the sheet.
    const m = width * params.margin;
    const frame: Point[] = [
      [m, m],
      [width - m, m],
      [width - m, height - m],
      [m, height - m],
    ];

    type Level = {
      domain: Node[];
      toWorld: DomainToWorld;
      cellWidth: CellWidth;
      off: number;
      rows: number;
    };
    const levels: Level[] = leaves.map((cells, k) => {
      const s = stepOf(k);
      const off = nTop * 2 ** (top - k); // grid x = i + off, so x ≥ 0
      const rows = Math.round(params.sigmaRes / 2 ** k);
      const toWorld: DomainToWorld = (x, y) => {
        const [px, py] = bipolarToXY(a, (x - off + 0.5) * s, -Math.PI + (y + 0.5) * s);
        return [cx + px, cy + py];
      };
      // Conformal: a cell's side is a·s / (cosh τ − cos σ), anywhere.
      const cellWidth: CellWidth = (x, y) =>
        (a * s) / (Math.cosh((x - off + 0.5) * s) - Math.cos(-Math.PI + (y + 0.5) * s));
      const nodes: Node[] = cells.map(([i, j]) => {
        const x = i + off;
        const [worldX, worldY] = toWorld(x, j);
        return { x, y: j, occupied: false, id: xyToId(x, j), worldX, worldY };
      });
      return { domain: clipDomainWithWorldCoords(nodes, frame), toWorld, cellWidth, off, rows };
    });

    const total = levels.reduce((n, l) => n + l.domain.length, 0) || 1;
    bands = levels.flatMap((level) => {
      if (level.domain.length < 2) return [];
      const config = {
        resolution: [level.off * 2, level.rows - 1],
        size: 1,
        stepSize: 1,
        walkerCount: Math.max(1, Math.round((params.walkers * level.domain.length) / total)),
        padding: 0,
        // The walk only; the bands are drawn here, not by nalee's path styles.
        pathStyle: 'solidStyle',
        flat: true,
      } satisfies Config;
      const system = createNaleeSystem(level.domain, config, level.toWorld, [colors.ink], colors.ground);
      const share: LineShare = (gx, gy) => Math.max(0, 1 - gapPx / level.cellWidth(gx, gy));
      return (
        system.walkers
          .flatMap((w) => walkerToPaths(w))
          .filter((path) => path.length > 1)
          .map((path) =>
            sampleBand(filletGrid(path as Point[], share), level.toWorld, level.cellWidth, share),
          )
          // Drop bands that never get wider than a hairline.
          .filter((band) => band.length > 1 && Math.max(...band.map((b) => b.w)) > 0.5)
      );
    });

    // What is left at each focus is a small τ-disc no cell can fill: a solid
    // dot, one gap clear of the grid's inner edge (centre a·coth τ, radius
    // a / sinh τ). A near-zero-length band so it fills and plots like a path
    // end (its round caps are the whole dot).
    const tauEdge = leaves.reduce(
      (m, cells, k) => cells.reduce((mm, [i]) => Math.max(mm, (i + 1) * stepOf(k)), m),
      0,
    );
    const r = a / Math.sinh(tauEdge) - gapPx;
    if (r * 2 >= penPxNow) {
      const c = a / Math.tanh(tauEdge);
      for (const side of [1, -1] as const) {
        const x = cx + side * c;
        const t: Point = [1, 0];
        const n: Point = [0, 1];
        bands.push([
          { p: [x - 0.01, cy], w: r * 2, t, n },
          { p: [x + 0.01, cy], w: r * 2, t, n },
        ]);
      }
    }
  };

  const rebuild = () => {
    build();
    props.render();
  };

  // ─── Pane ────────────────────────────────────────────────────────────────────

  // React to the editable inputs only, once a drag settles. A pane-wide
  // 'change' listener would also hear the read-only monitors, which poll —
  // and a rebuild per poll never lets the page go idle.
  const onInput = (binding: any, then: () => void = rebuild) =>
    binding.on('change', (ev: { last?: boolean }) => {
      if (ev.last !== false) then();
    });
  const redraw = () => props.render();

  const grid = pane.addFolder({ title: 'Grid' });
  onInput(grid.addBinding(params, 'sigmaRes', { min: 24, max: 240, step: 4, label: 'resolution' }));
  onInput(grid.addBinding(params, 'tauMax', { min: 0.8, max: 8, step: 0.1, label: 'reach (τ)' }));
  onInput(grid.addBinding(params, 'focal', { min: 0.05, max: 0.45, step: 0.01, label: 'foci apart' }));
  onInput(grid.addBinding(params, 'margin', { min: 0, max: 0.2, step: 0.005 }));

  const paths = pane.addFolder({ title: 'Paths' });
  onInput(paths.addBinding(params, 'walkers', { min: 1, max: 80, step: 1 }));
  onInput(paths.addBinding(params, 'minLine', { min: 1, max: 6, step: 0.25, label: 'min line (× pen)' }));
  onInput(paths.addBinding(params, 'gapMm', { min: 0.1, max: 5, step: 0.05, label: 'gap (mm)' }));

  const colour = pane.addFolder({ title: 'Colour' });
  colour.addBinding(colors, 'ink', { readonly: true });
  colour.addBinding(colors, 'ground', { readonly: true });
  onInput(colour.addBinding(params, 'invert'), redraw);
  colour.addButton({ title: 'New palette' }).on('click', () => {
    dealPalette();
    pane.refresh();
    redraw();
  });

  const plotFolder = pane.addFolder({ title: 'Plot' });
  onInput(
    plotFolder.addBinding(params, 'paper', { options: { A5: 'a5', A4: 'a4', A3: 'a3' } }),
    rebuild, // the sheet sets how many px a mm of gap is
  );
  onInput(plotFolder.addBinding(params, 'plotMargin', { min: 0, max: 6, step: 0.1, label: 'margin (cm)' }), rebuild);
  onInput(plotFolder.addBinding(params, 'penMm', { min: 0.1, max: 3, step: 0.05, label: 'pen (mm)' }), rebuild); // the pen sets where cells coarsen
  onInput(
    plotFolder.addBinding(params, 'plotMode', {
      label: 'draws',
      options: { fill: 'fill', outline: 'outline', centre: 'centre' },
    }),
    redraw,
  );
  onInput(plotFolder.addBinding(params, 'preview', { label: 'preview plot' }), redraw);
  plotFolder.addButton({ title: 'Save SVG' }).on('click', saveSvg);

  pane.addBinding(params, 'seed', { readonly: true });
  pane.addButton({ title: 'Regenerate' }).on('click', () => {
    params.seed = Random.getRandomSeed();
    pane.refresh();
    rebuild();
  });

  dealPalette();
  build();

  wrap.render = () => {
    const ink = params.invert ? colors.ground : colors.ink;
    const ground = params.invert ? colors.ink : colors.ground;
    context.fillStyle = ground;
    context.fillRect(0, 0, width, height);
    if (params.preview) {
      // Exactly the plotted lines, at the pen's width on this sheet.
      context.strokeStyle = ink;
      context.lineWidth = penPx();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const line of plot()) {
        context.beginPath();
        line.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
        context.stroke();
      }
    } else {
      context.fillStyle = ink;
      // Only what the pen can draw: stretches thinner than the pen are left
      // off here too, so the screen matches the plot.
      const pen = penPx();
      for (const band of bands) for (const run of plottable(band, pen)) fillBand(context, run);
    }
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
