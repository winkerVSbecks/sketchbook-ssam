/**
 * nalee-whitespace — differential-growth with the rest of its grid filled.
 *
 * The organism still packs a polyomino grown from the centre of a square grid
 * (see ./differential-growth). Here the empty cells are no longer ground:
 * each is split into a `sub`×`sub` lattice and nalee walkers (hold a
 * direction, bounce at walls, die when boxed in, spawn until every node is
 * taken) tile the whole white space as one connected field of orthogonal
 * paths. The pitch is close to the curve's own spacing, so both halves carry
 * the same density — one grown, one walked.
 *
 * On a paper ground (slate when reversed) the domain is washed in the low
 * tier and its curve drawn in the high-tier ink, ≈7.5:1 apart; the walks take
 * the mid-tier accent. Every parameter lives in the tweakpane: layout and
 * growth rebuild from the same seed, colour only redraws.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { cuspPalette } from '../../colors/cusphanger';
import { createGrowth, type Growth } from '../terminal-ui/growth-sim';
import {
  createConfiner,
  createMask,
  naleeWalks,
  outline,
  regionRects,
  type Edge,
  type LatticePoint,
  type Rect,
} from './region';

/** World units per grid cell. */
const CELL = 6;
/** Upper bound on the warm-up, however many steps are asked for. */
const WARMUP_MS = 6000;
/** Node budget per world unit² of domain at the default spacing. */
const NODES_PER_AREA = 7.5;
const DEFAULT_RADIUS = 0.9;

interface Params {
  /** Layout seed: the domain, the walks and the organism's own seed. */
  seed: string;
  /** Grid cells per side. */
  grid: number;
  /** Share of the grid the polyomino takes. */
  share: number;
  /** Lattice nodes per side of an empty cell. */
  sub: number;
  /** Longest walk, in multiples of `sub`. */
  walkLength: number;
  /** Repulsion radius: the curve's spacing, in world units. */
  radius: number;
  /** Line width (curve and walks) as a fraction of the radius. */
  stroke: number;
  /** Steps run before the first frame. */
  warmup: number;
  /** Steps run per frame; 0 freezes the growth. */
  speed: number;
  /** Colour seed: the palette's ring, shuffle and jitter. */
  paletteSeed: string;
  hue: number;
  /** Degrees between ring hues (the walks take the second hue when it differs). */
  angle: number;
  saturation: number;
  /** WCAG targets against the ground: curve, walks, domain wash. */
  ink: number;
  accent: number;
  wash: number;
  /** Wash the domain behind the curve. */
  fill: boolean;
  /** Slate ground instead of paper. */
  reverse: boolean;
  /** Hairline outline of the domain. */
  debug: boolean;
}

interface Layout {
  growth: Growth;
  walks: LatticePoint[][];
  rects: Rect[];
  edges: Edge[];
  step(): void;
}

/**
 * A nalee-style clipped domain: start from the centre cell and keep adding a
 * random cell that touches the shape, so it stays one orthogonally connected
 * piece with arms and notches the system chose, not a hand-drawn outline.
 */
function growDomain(grid: number, share: number): boolean[][] {
  const cells = Array.from({ length: grid }, () => Array<boolean>(grid).fill(false));
  const c = Math.floor(grid / 2);
  cells[c][c] = true;
  const target = Math.max(1, Math.round(grid * grid * share));
  for (let count = 1; count < target; count++) {
    const frontier: [number, number][] = [];
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        if (cells[y][x]) continue;
        if (cells[y - 1]?.[x] || cells[y + 1]?.[x] || cells[y][x - 1] || cells[y][x + 1]) {
          frontier.push([x, y]);
        }
      }
    }
    const [x, y] = Random.pick(frontier);
    cells[y][x] = true;
  }
  return cells;
}

function buildLayout(p: Params): Layout {
  Random.setSeed(p.seed);
  console.log(p.seed);

  const cells = growDomain(p.grid, p.share);
  const mask = createMask(p.grid, p.grid, CELL);
  cells.forEach((row, y) => row.forEach((on, x) => on && (mask.ids[y * p.grid + x] = 0)));
  const confine = createConfiner(mask, p.radius * 0.5);
  const area = mask.ids.filter((id) => id === 0).length * CELL * CELL;

  const c = Math.floor(p.grid / 2);
  const growth = createGrowth({
    seed: Random.rangeFloor(1, 0xffffff),
    origin: { x: (c + 0.5) * CELL, y: (c + 0.5) * CELL },
    radius: 1.5,
    repulsionRadius: p.radius,
    maxNodes: Math.round(area * NODES_PER_AREA * (DEFAULT_RADIUS / p.radius)),
  });

  // The white space: a lattice over the empty cells, walked the nalee way.
  const lattice = p.grid * p.sub;
  const walks = naleeWalks(
    lattice,
    lattice,
    (x, y) => !cells[Math.floor(y / p.sub)][Math.floor(x / p.sub)],
    () => Random.rangeFloor(p.sub, p.sub * p.walkLength + 1),
  );

  return {
    growth,
    walks,
    rects: regionRects(mask).get(0) ?? [],
    edges: outline(mask),
    step() {
      growth.step();
      for (const n of growth.state.nodes) confine(0, n);
    },
  };
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  const params: Params = {
    seed,
    grid: 11,
    share: 0.42,
    sub: 7,
    walkLength: 30,
    radius: DEFAULT_RADIUS,
    stroke: 0.4,
    warmup: 1400,
    speed: 2,
    paletteSeed: Random.getRandomSeed(),
    hue: 232,
    angle: 51,
    saturation: 1,
    ink: 12,
    accent: 4.5,
    wash: 1.6,
    fill: false,
    reverse: true,
    debug: false,
  };

  // Collapsed in the gallery, where every cell would otherwise carry one.
  const inGallery = new URLSearchParams(location.search).has('gallery');
  const pane = new Pane({ title: 'nalee-whitespace', expanded: !inGallery }) as any;
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

  let layout: Layout;
  const colors = { bg: '', ink: '', accent: '', wash: '', hairline: '' };

  const build = () => {
    layout = buildLayout(params);
    const t0 = performance.now();
    for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) layout.step();
  };

  // One hue by default; a non-zero angle hands the walks a second hue off the ring.
  const paint = () => {
    Random.setSeed(params.paletteSeed);
    const palette = cuspPalette({
      hue: params.hue,
      count: params.angle > 0 ? 2 : 1,
      angle: params.angle > 0 ? params.angle : 30,
      shuffle: false,
      saturation: params.saturation,
      ground: params.reverse ? 'dark' : 'light',
      targets: { high: params.ink, mid: params.accent, low: params.wash },
    });
    const base = palette.baseIndex;
    const other = palette.hues.length > 1 ? 1 - base : base;
    colors.bg = palette.bg.css;
    colors.ink = palette.tiers.high[base].css;
    colors.wash = palette.tiers.low[base].css;
    colors.accent = palette.tiers.mid[other].css;
    colors.hairline = palette.tiers.mid[base].css;
  };

  const rebuild = () => {
    build();
    props.render();
  };
  const repaint = () => {
    paint();
    props.render();
  };

  // React once a drag settles, not on every intermediate value: a rebuild
  // re-runs the warm-up, which is too slow to chase a slider.
  const onInput = (binding: any, then: () => void) =>
    binding.on('change', (ev: { last?: boolean }) => {
      if (ev.last !== false) then();
    });

  const layoutFolder = pane.addFolder({ title: 'Layout' });
  onInput(layoutFolder.addBinding(params, 'grid', { min: 3, max: 15, step: 1 }), rebuild);
  onInput(layoutFolder.addBinding(params, 'share', { min: 0.05, max: 0.9, step: 0.01, label: 'domain share' }), rebuild);
  onInput(layoutFolder.addBinding(params, 'sub', { min: 2, max: 12, step: 1, label: 'walk lattice' }), rebuild);
  onInput(layoutFolder.addBinding(params, 'walkLength', { min: 1, max: 30, step: 1, label: 'walk length' }), rebuild);
  layoutFolder.addBinding(params, 'seed', { readonly: true });
  layoutFolder.addButton({ title: 'Regenerate' }).on('click', () => {
    params.seed = Random.getRandomSeed();
    pane.refresh();
    rebuild();
  });

  const growthFolder = pane.addFolder({ title: 'Growth' });
  onInput(growthFolder.addBinding(params, 'radius', { min: 0.5, max: 2, step: 0.05, label: 'spacing' }), rebuild);
  growthFolder.addBinding(params, 'stroke', { min: 0.1, max: 1, step: 0.01 });
  onInput(growthFolder.addBinding(params, 'warmup', { min: 0, max: 3000, step: 50 }), rebuild);
  growthFolder.addBinding(params, 'speed', { min: 0, max: 8, step: 1, label: 'steps / frame' });

  const colour = pane.addFolder({ title: 'Colour' });
  onInput(colour.addBinding(params, 'reverse', { label: 'slate' }), repaint);
  onInput(colour.addBinding(params, 'fill', { label: 'wash domain' }), repaint);
  onInput(colour.addBinding(params, 'hue', { min: 0, max: 360, step: 1 }), repaint);
  onInput(colour.addBinding(params, 'angle', { min: 0, max: 180, step: 1, label: 'walk hue Δ' }), repaint);
  onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
  onInput(colour.addBinding(params, 'ink', { min: 4.5, max: 18, step: 0.1, label: 'ink (:1)' }), repaint);
  onInput(colour.addBinding(params, 'accent', { min: 1.5, max: 12, step: 0.1, label: 'walks (:1)' }), repaint);
  onInput(colour.addBinding(params, 'wash', { min: 1.05, max: 3, step: 0.05, label: 'wash (:1)' }), repaint);
  colour.addButton({ title: 'New palette' }).on('click', () => {
    params.paletteSeed = Random.getRandomSeed();
    params.hue = Math.round(Random.range(0, 360));
    pane.refresh();
    repaint();
  });

  pane.addBinding(params, 'debug', { label: 'outlines' });

  build();
  paint();

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < params.speed; i++) layout.step();

    const extent = params.grid * CELL;
    const scale = Math.min(width, height) * (0.88 / extent);
    const pitch = CELL / params.sub;
    const { growth, walks } = layout;

    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate((width - extent * scale) / 2, (height - extent * scale) / 2);

    if (params.fill) {
      context.fillStyle = colors.wash;
      context.beginPath();
      for (const [x, y, w, h] of layout.rects) context.rect(x * scale, y * scale, w * scale, h * scale);
      context.fill();
    }

    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = growth.params.repulsionRadius * params.stroke * scale;

    context.strokeStyle = colors.accent;
    context.beginPath();
    for (const walk of walks) {
      walk.forEach(([x, y], i) => {
        const px = (x + 0.5) * pitch * scale;
        const py = (y + 0.5) * pitch * scale;
        if (i === 0) context.moveTo(px, py);
        // A lone node still gets a mark: a zero-length segment with round caps.
        if (i > 0 || walk.length === 1) context.lineTo(px, py);
      });
    }
    context.stroke();

    context.strokeStyle = colors.ink;
    context.beginPath();
    growth.state.nodes.forEach((p, i) => {
      if (i === 0) context.moveTo(p.x * scale, p.y * scale);
      else context.lineTo(p.x * scale, p.y * scale);
    });
    context.closePath();
    context.stroke();

    if (params.debug) {
      context.strokeStyle = colors.hairline;
      context.lineWidth = 1;
      context.beginPath();
      for (const [x0, y0, x1, y1] of layout.edges) {
        context.moveTo(x0 * scale, y0 * scale);
        context.lineTo(x1 * scale, y1 * scale);
      }
      context.stroke();
    }

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: true,
  duration: 20000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
