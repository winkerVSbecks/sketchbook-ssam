/**
 * The sketch body shared by `thick-nalee`, `one-line` and `windows`: lattice paths
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
import { WINDOW_STYLES, windowFrame, type WindowStyle } from './window-frame';

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
  /** WCAG target of the curve's ink against the ground. */
  ink: number;
  /** WCAG target of the band's wash against the ground. */
  wash: number;
  /** Slate ground instead of paper: dark washes, pale inks. */
  reverse: boolean;
  /** Hairline outline of every band. */
  debug: boolean;
  /** Windowed variants: which paths fill the field. */
  grid: 'walks' | 'line';
  /** Windowed variants: the frame the field is seen through. */
  window: WindowStyle;
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
  /** Clip the field to a window frame, with grid and frame controls. */
  windowed?: boolean;
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
      grid: 'walks',
      window: 'arch',
      ...o.defaults(),
    };

    // Collapsed in the gallery, where every cell would otherwise carry one.
    const inGallery = new URLSearchParams(location.search).has('gallery');
    const pane = new Pane({ title: o.title, expanded: !inGallery }) as any;
    pane.element.parentElement.style.zIndex = '1';

    let field: BandField;
    const colors = {
      bg: '',
      inks: [] as string[],
      washes: [] as string[],
      hairline: '',
      frame: { front: '', top: '', side: '' },
    };

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

    // Paper ground (slate when reversed); each band washed in its hue's low
    // tier and drawn in the same hue's ink, pushed past the default 9:1 so
    // line on fill holds ≈7.5:1 on either ground.
    const paint = () => {
      Random.setSeed(params.paletteSeed);
      const palette = cuspPalette({
        hue: params.hue,
        count: o.multiHue ? params.count : 1,
        angle: params.angle,
        saturation: params.saturation,
        ground: params.reverse ? 'dark' : 'light',
        targets: { high: params.ink, low: params.wash },
      });
      colors.bg = palette.bg.css;
      colors.inks = palette.tiers.high.map((s) => s.css);
      colors.washes = palette.tiers.low.map((s) => s.css);
      colors.hairline = palette.tiers.mid[0].css;
      // The frame is the darkest ink on the front; its depth faces step down
      // to the mid tier, the side a shade deeper than the top.
      // With one hue the side sits halfway down that hue's ramp from mid to high.
      const mids = palette.tiers.mid;
      const [m, h] = [mids[0].color, palette.tiers.high[0].color];
      colors.frame = {
        front: palette.tiers.high[0].css,
        top: mids[mids.length - 1].css,
        side:
          mids.length > 1
            ? mids[0].css
            : `oklch(${((m.l + h.l) / 2).toFixed(4)} ${((m.c + h.c) / 2).toFixed(4)} ${m.h.toFixed(2)})`,
      };
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
    if (o.windowed) {
      onInput(
        layout.addBinding(params, 'window', {
          options: Object.fromEntries(WINDOW_STYLES.map((w) => [w, w])),
        }),
        () => props.render(),
      );
      onInput(
        layout.addBinding(params, 'grid', { options: { 'nalee walks': 'walks', 'one line': 'line' } }),
        rebuild,
      );
    }
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
    if (o.walks || o.windowed) {
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

      context.fillStyle = colors.bg;
      context.fillRect(0, 0, width, height);

      // Windowed: the field covers the aperture's bounds and is clipped to it;
      // otherwise it sits centred in the canvas with a margin.
      const frame = o.windowed ? windowFrame(params.window, width, height) : undefined;
      const box = frame?.bounds;
      const scale = box
        ? Math.max(box.w, box.h) / field.extent
        : Math.min(width, height) * (0.88 / field.extent);
      const cx = box ? box.x + box.w / 2 : width / 2;
      const cy = box ? box.y + box.h / 2 : height / 2;

      context.save();
      if (frame) context.clip(frame.aperture);
      context.translate(cx - (field.extent * scale) / 2, cy - (field.extent * scale) / 2);

      field.rects.forEach((rects, i) => {
        context.fillStyle = colors.washes[i % colors.washes.length];
        context.beginPath();
        for (const [x, y, w, h] of rects) context.rect(x * scale, y * scale, w * scale, h * scale);
        context.fill();
      });

      context.lineJoin = 'round';
      context.lineCap = 'round';
      field.organisms.forEach((growth, i) => {
        context.strokeStyle = colors.inks[i % colors.inks.length];
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

      frame?.draw(context, colors.frame);
    };

    return () => pane.dispose();
  };
