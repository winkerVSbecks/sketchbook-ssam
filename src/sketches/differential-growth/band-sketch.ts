/**
 * The sketch body shared by `thick-nalee` and `one-line`: lattice paths
 * stamped as thick bands, each band washed in and packed by its own
 * differential-growth curve, with a tweakpane over layout, growth and colour.
 *
 * Each variant only supplies its paths and defaults. Layout and growth
 * changes rebuild from the same seed (and re-run the warm-up); colour
 * changes only redraw. Not a sketch file itself — it exports no `sketch`;
 * the variant wires HMR and export, calling the returned cleanup on dispose.
 */
import { Pane } from 'tweakpane';
import type { SketchProps } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { cuspPalette } from '../../colors/cusphanger';
import { createBandField, type BandField } from './bands';
import type { LatticePoint } from './region';

/** World units per mask cell. */
const CELL = 2;
/** Upper bound on the warm-up, however many steps are asked for. */
const WARMUP_MS = 6000;

export interface BandParams {
  /** Layout seed: the paths and the organisms' own seeds. */
  seed: string;
  /** Lattice nodes per side. */
  lattice: number;
  /** Mask cells from one lattice node to the next. */
  pitch: number;
  /** Mask cells of ground left between neighbouring bands. */
  gap: number;
  /** Longest walk, in multiples of the lattice side (walk variants only). */
  walkLength: number;
  /** Repulsion radius: the curve's spacing, in world units. */
  radius: number;
  /** Curve width as a fraction of the radius. */
  stroke: number;
  /** Steps run before the first frame. */
  warmup: number;
  /** Steps run per frame; 0 freezes the growth. */
  speed: number;
  /** Colour seed: the palette's ring, shuffle and jitter. */
  paletteSeed: string;
  hue: number;
  /** Hues taken off the ring; bands cycle through them. */
  count: number;
  /** Degrees between ring hues. */
  angle: number;
  saturation: number;
  /** WCAG target of the curve's ink against the paper. */
  ink: number;
  /** WCAG target of the band's wash against the paper. */
  wash: number;
  /** Swap ink and wash: dark bands, pale curves. */
  reverse: boolean;
  /** Hairline outline of every band. */
  debug: boolean;
}

export interface BandSketchOptions {
  title: string;
  /** Lattice paths for the current params; called right after seeding. */
  paths: (params: BandParams) => LatticePoint[][];
  /** Overrides on the shared defaults, drawn after the layout seed is set. */
  defaults: () => Partial<BandParams>;
  /** Show the walk-length control (variants built from nalee walks). */
  walks?: boolean;
  /** Show the hue-count control (variants with more than one band). */
  multiHue?: boolean;
}

export const bandSketch =
  (o: BandSketchOptions) =>
  ({ wrap, context, ...props }: SketchProps): (() => void) => {
    const seed = Random.getRandomSeed();
    Random.setSeed(seed);
    const params: BandParams = {
      seed,
      lattice: 7,
      pitch: 4,
      gap: 1,
      walkLength: 3,
      radius: 0.9,
      stroke: 0.55,
      warmup: 500,
      speed: 2,
      paletteSeed: Random.getRandomSeed(),
      hue: Random.range(0, 360),
      count: 1,
      angle: Random.range(30, 120),
      saturation: 0.6,
      ink: 12,
      wash: 1.6,
      reverse: false,
      debug: false,
      ...o.defaults(),
    };

    // Collapsed in the gallery, where every cell would otherwise carry one.
    const inGallery = new URLSearchParams(location.search).has('gallery');
    const pane = new Pane({ title: o.title, expanded: !inGallery }) as any;
    pane.element.parentElement.style.zIndex = '1';

    let field: BandField;
    const colors = { bg: '', inks: [] as string[], washes: [] as string[], hairline: '' };

    const build = () => {
      Random.setSeed(params.seed);
      console.log(params.seed);
      field = createBandField(o.paths(params), {
        lattice: params.lattice,
        pitch: params.pitch,
        band: params.pitch - params.gap,
        cell: CELL,
        margin: params.radius * 0.5,
        radius: params.radius,
        seed: () => Random.rangeFloor(1, 0xffffff),
      });
      const t0 = performance.now();
      for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) field.step();
    };

    // Paper ground; each band washed in its hue's low tier and drawn in the
    // same hue's ink, pushed past the default 9:1 so line on fill holds ≈7.5:1.
    const paint = () => {
      Random.setSeed(params.paletteSeed);
      const palette = cuspPalette({
        hue: params.hue,
        count: o.multiHue ? params.count : 1,
        angle: params.angle,
        saturation: params.saturation,
        ground: 'light',
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

    // React once a drag settles, not on every intermediate value: a rebuild
    // re-runs the warm-up, which is too slow to chase a slider.
    const onInput = (binding: any, then: () => void) =>
      binding.on('change', (ev: { last?: boolean }) => {
        if (ev.last !== false) then();
      });

    const layout = pane.addFolder({ title: 'Layout' });
    onInput(layout.addBinding(params, 'lattice', { min: 2, max: 14, step: 1 }), rebuild);
    onInput(layout.addBinding(params, 'pitch', { min: 2, max: 10, step: 1 }), () => {
      params.gap = Math.min(params.gap, params.pitch - 1);
      pane.refresh();
      rebuild();
    });
    onInput(layout.addBinding(params, 'gap', { min: 0, max: 4, step: 1 }), () => {
      params.gap = Math.min(params.gap, params.pitch - 1);
      pane.refresh();
      rebuild();
    });
    if (o.walks) {
      onInput(
        layout.addBinding(params, 'walkLength', { min: 1, max: 12, step: 0.5, label: 'walk length' }),
        rebuild,
      );
    }
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
    onInput(colour.addBinding(params, 'reverse'), repaint);
    onInput(colour.addBinding(params, 'hue', { min: 0, max: 360, step: 1 }), repaint);
    if (o.multiHue) onInput(colour.addBinding(params, 'count', { min: 1, max: 6, step: 1, label: 'hues' }), repaint);
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

    wrap.render = ({ width, height }: SketchProps) => {
      for (let i = 0; i < params.speed; i++) field.step();

      const scale = Math.min(width, height) * (0.88 / field.extent);
      const lines = params.reverse ? colors.washes : colors.inks;
      const fills = params.reverse ? colors.inks : colors.washes;

      context.fillStyle = colors.bg;
      context.fillRect(0, 0, width, height);

      context.save();
      context.translate((width - field.extent * scale) / 2, (height - field.extent * scale) / 2);

      field.rects.forEach((rects, i) => {
        context.fillStyle = fills[i % fills.length];
        context.beginPath();
        for (const [x, y, w, h] of rects) context.rect(x * scale, y * scale, w * scale, h * scale);
        context.fill();
      });

      context.lineJoin = 'round';
      context.lineCap = 'round';
      field.organisms.forEach((growth, i) => {
        context.strokeStyle = lines[i % lines.length];
        context.lineWidth = growth.params.repulsionRadius * params.stroke * scale;
        context.beginPath();
        growth.state.nodes.forEach((p, j) => {
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
        for (const [x0, y0, x1, y1] of field.edges) {
          context.moveTo(x0 * scale, y0 * scale);
          context.lineTo(x1 * scale, y1 * scale);
        }
        context.stroke();
      }

      context.restore();
    };

    return () => pane.dispose();
  };
