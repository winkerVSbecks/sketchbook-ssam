/**
 * windows — differential growth let in only through the openings of a screen.
 *
 * A square wall is pierced by convex openings (./window-shapes): rectangular
 * windows split by mullions, or a jali — staggered triangles, diamonds, or
 * khidki's diagonal-cut grill. The bars between them stay bare ground; each
 * opening is washed in and holds its own organism (../terminal-ui/growth-sim),
 * seeded as its own outline at half size and kept a margin inside its edges,
 * so every window packs to its shape independently.
 *
 * Paper ground (slate when reversed); openings take a hue's low-tier wash and
 * their curves the same hue's ink, ≈7.5:1 apart. Every parameter lives in the
 * tweakpane: layout and growth rebuild from the same seed, colour only redraws.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { cuspPalette } from '../../colors/cusphanger';
import { createGrowth, type Growth } from '../terminal-ui/growth-sim';
import {
  PATTERNS,
  area,
  centroid,
  createPolygonConfiner,
  windowOpenings,
  type Pattern,
  type Polygon,
} from './window-shapes';

/** Side of the wall, in world units. */
const EXTENT = 60;
/** Upper bound on the warm-up, however many steps are asked for. */
const WARMUP_MS = 6000;
/** Node budget per world unit² of opening at the default spacing. */
const NODES_PER_AREA = 4;
const DEFAULT_RADIUS = 0.9;

interface Params {
  /** Layout seed: the panes and the organisms' own seeds. */
  seed: string;
  pattern: Pattern;
  /** Lattice cells (or windows) across the wall. */
  divisions: number;
  /** Bar thickness between openings, in world units. */
  frame: number;
  /** Repulsion radius: the curve's spacing, in world units. */
  radius: number;
  /** Curve width as a fraction of the radius. */
  stroke: number;
  warmup: number;
  /** Steps per frame; 0 freezes the growth. */
  speed: number;
  paletteSeed: string;
  hue: number;
  /** Hues taken off the ring; openings cycle through them. */
  count: number;
  angle: number;
  saturation: number;
  /** WCAG targets against the ground: curve ink, opening wash. */
  ink: number;
  wash: number;
  /** Slate ground instead of paper. */
  reverse: boolean;
  /** Hairline outline of every opening. */
  debug: boolean;
}

interface Opening {
  poly: Polygon;
  growth: Growth;
  confine: (p: { x: number; y: number }) => void;
}

function buildOpenings(p: Params): Opening[] {
  Random.setSeed(p.seed);
  console.log(p.seed);
  const margin = p.radius * 0.5;
  // Too small to hold a loop of curve: skip rather than draw a stub.
  const minArea = (p.radius * 3) ** 2;
  const polys = windowOpenings(
    { pattern: p.pattern, extent: EXTENT, divisions: p.divisions, frame: p.frame },
    minArea,
  );
  const density = NODES_PER_AREA * (DEFAULT_RADIUS / p.radius);
  return polys.map((poly) => {
    const growth = createGrowth({
      seed: Random.rangeFloor(1, 0xffffff),
      repulsionRadius: p.radius,
      maxNodes: Math.max(32, Math.round(area(poly) * density)),
    });
    // Seed with the opening's own outline at half size: the curve starts with
    // the window's shape and buckles outward to its edges and inward to fill.
    const c = centroid(poly);
    growth.state.nodes = poly.map(([x, y]) => ({ x: c.x + (x - c.x) * 0.5, y: c.y + (y - c.y) * 0.5 }));
    return { poly, growth, confine: createPolygonConfiner(poly, margin) };
  });
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  const params: Params = {
    seed,
    pattern: Random.pick(PATTERNS),
    divisions: 5,
    frame: 1.5,
    radius: DEFAULT_RADIUS,
    stroke: 0.55,
    warmup: 500,
    speed: 2,
    paletteSeed: Random.getRandomSeed(),
    hue: Math.round(Random.range(0, 360)),
    count: Random.rangeFloor(1, 4),
    angle: Math.round(Random.range(30, 120)),
    saturation: 0.6,
    ink: 12,
    wash: 1.6,
    reverse: false,
    debug: false,
  };

  // Collapsed in the gallery, where every cell would otherwise carry one.
  const inGallery = new URLSearchParams(location.search).has('gallery');
  const pane = new Pane({ title: 'windows', expanded: !inGallery }) as any;
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

  let openings: Opening[] = [];
  const colors = { bg: '', inks: [] as string[], washes: [] as string[], hairline: '' };

  const step = () => {
    for (const o of openings) {
      o.growth.step();
      for (const n of o.growth.state.nodes) o.confine(n);
    }
  };

  const build = () => {
    openings = buildOpenings(params);
    const t0 = performance.now();
    for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) step();
  };

  const paint = () => {
    Random.setSeed(params.paletteSeed);
    const palette = cuspPalette({
      hue: params.hue,
      count: params.count,
      angle: params.angle,
      saturation: params.saturation,
      ground: params.reverse ? 'dark' : 'light',
      targets: { high: params.ink, low: params.wash },
    });
    colors.bg = palette.bg.css;
    colors.inks = palette.tiers.high.map((s) => s.css);
    colors.washes = palette.tiers.low.map((s) => s.css);
    colors.hairline = palette.tiers.mid[0].css;
  };

  const rebuild = () => {
    build();
    props.render();
  };
  const repaint = () => {
    paint();
    props.render();
  };

  // React once a drag settles: a rebuild re-runs the warm-up, too slow to
  // chase a slider.
  const onInput = (binding: any, then: () => void) =>
    binding.on('change', (ev: { last?: boolean }) => {
      if (ev.last !== false) then();
    });

  const layout = pane.addFolder({ title: 'Layout' });
  onInput(
    layout.addBinding(params, 'pattern', {
      options: Object.fromEntries(PATTERNS.map((p) => [p, p])),
    }),
    rebuild,
  );
  onInput(layout.addBinding(params, 'divisions', { min: 1, max: 14, step: 1 }), rebuild);
  onInput(layout.addBinding(params, 'frame', { min: 0.2, max: 6, step: 0.1, label: 'bar' }), rebuild);
  layout.addBinding(params, 'seed', { readonly: true });
  layout.addButton({ title: 'Regenerate' }).on('click', () => {
    params.seed = Random.getRandomSeed();
    pane.refresh();
    rebuild();
  });

  const growth = pane.addFolder({ title: 'Growth' });
  onInput(growth.addBinding(params, 'radius', { min: 0.5, max: 2, step: 0.05, label: 'spacing' }), rebuild);
  growth.addBinding(params, 'stroke', { min: 0.1, max: 1, step: 0.01 });
  onInput(growth.addBinding(params, 'warmup', { min: 0, max: 2000, step: 50 }), rebuild);
  growth.addBinding(params, 'speed', { min: 0, max: 8, step: 1, label: 'steps / frame' });

  const colour = pane.addFolder({ title: 'Colour' });
  onInput(colour.addBinding(params, 'reverse', { label: 'slate' }), repaint);
  onInput(colour.addBinding(params, 'hue', { min: 0, max: 360, step: 1 }), repaint);
  onInput(colour.addBinding(params, 'count', { min: 1, max: 6, step: 1, label: 'hues' }), repaint);
  onInput(colour.addBinding(params, 'angle', { min: 1, max: 180, step: 1 }), repaint);
  onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
  onInput(colour.addBinding(params, 'ink', { min: 4.5, max: 18, step: 0.1, label: 'ink (:1)' }), repaint);
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

  const trace = (poly: Polygon, scale: number) => {
    poly.forEach(([x, y], i) => {
      if (i === 0) context.moveTo(x * scale, y * scale);
      else context.lineTo(x * scale, y * scale);
    });
    context.closePath();
  };

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < params.speed; i++) step();

    const scale = Math.min(width, height) * (0.88 / EXTENT);
    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate((width - EXTENT * scale) / 2, (height - EXTENT * scale) / 2);

    openings.forEach((o, i) => {
      context.fillStyle = colors.washes[i % colors.washes.length];
      context.beginPath();
      trace(o.poly, scale);
      context.fill();
    });

    context.lineJoin = 'round';
    context.lineCap = 'round';
    openings.forEach((o, i) => {
      context.strokeStyle = colors.inks[i % colors.inks.length];
      context.lineWidth = o.growth.params.repulsionRadius * params.stroke * scale;
      context.beginPath();
      o.growth.state.nodes.forEach((p, j) => {
        if (j === 0) context.moveTo(p.x * scale, p.y * scale);
        else context.lineTo(p.x * scale, p.y * scale);
      });
      context.closePath();
      context.stroke();
    });

    if (params.debug) {
      context.strokeStyle = colors.hairline;
      context.lineWidth = 1;
      context.beginPath();
      for (const o of openings) trace(o.poly, scale);
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
