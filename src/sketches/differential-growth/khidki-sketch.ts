/**
 * The body of `khidki`: a grill over an opening, every block it leaves open
 * filled with nalee walks or a differential-growth curve grown from the
 * block's widest point and confined to it (./khidki-field). The pane's
 * `grill` picks which.
 *
 * `khidki` is its own window: the jali's deep rectangular
 * frame (./window-frame) with ../khidki's grill inside — bars, waisted
 * lozenges, circles and diamonds on the crossings — filled in noise patches
 * or by whole lozenge stars. Any other is a gate or window from ./grills,
 * laid out afresh to fill the same window frame, in noise patches.
 *
 * Colour (./khidki-colours): slate ground (paper when off), a fresh palette
 * every load. Fills quiet in two hues, bars the highest contrast, circles
 * and diamonds well clear of the fills, the frame one hue in three shades. Every parameter lives in the tweakpane: layout and growth rebuild
 * from the same seed, colour only redraws. Not a sketch file itself — it
 * exports no `sketch`; the variant wires HMR and export, calling the
 * returned cleanup on dispose.
 */
import type { SketchProps } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import {
  APERTURE_H,
  APERTURE_W,
  createKhidkiField,
  type FillPattern,
  type GrillShape,
  type KhidkiField,
  type StarPick,
} from './khidki-field';
import { GRILL_BUILDERS } from './grills';
import { HARMONIES, khidkiColours, type Harmony } from './khidki-colours';
import { outline } from './region';
import { windowFrame } from './window-frame';

/** Upper bound on the warm-up, however many steps are asked for. */
const WARMUP_MS = 6000;

interface Params {
  seed: string;
  /** Bar thickness, in world units (bar pitch is 10). */
  bar: number;
  /** Circle and diamond size, relative to the reference. */
  knot: number;
  /** Whole lozenge stars grown and the rest walked, or noise patches. */
  pattern: FillPattern;
  /** Stars centred on circles at odd or even grill positions. */
  starSet: 'odd' | 'even';
  /** Which of those stars grow. */
  starPick: StarPick;
  /** Patches: share of blocks grown rather than walked. */
  growthShare: number;
  /** Patches: size of the patches each kind gathers into, in bar pitches. */
  groupSize: number;
  /** Walk lattice pitch, in world units. */
  walkPitch: number;
  /** Longest walk, in lattice steps. */
  walkLength: number;
  /** Repulsion radius: the curve's spacing, in world units. */
  radius: number;
  /** Line width (curves and walks) as a fraction of the radius. */
  stroke: number;
  warmup: number;
  /** Steps per frame; 0 freezes the growth. */
  speed: number;
  paletteSeed: string;
  hue: number;
  /** How the four hues (growth, walks, frame, knots) sit round the wheel. */
  harmony: Harmony;
  saturation: number;
  /** WCAG contrast against the ground: circles and diamonds (`ink`), both
   * fills (`accent`), the frame's front (`frameTone`). Bars always take the
   * most their hue can reach. See ./khidki-colours. */
  ink: number;
  accent: number;
  frameTone: number;
  /** Slate ground instead of paper. */
  reverse: boolean;
  /** Hairline outline of every block. */
  debug: boolean;
  /** Which grill: 'khidki' for its own window, or a name from ./grills. */
  grill: string;
}

export interface KhidkiSketchOptions {
  title: string;
  /** Overrides on the defaults, drawn after the layout seed is set. */
  defaults?: () => Partial<Params>;
}

/** Every grill the sketch can fill: khidki's own window first, then ./grills. */
export const GRILL_NAMES = ['khidki', ...GRILL_BUILDERS.map((b) => b.name)];

/**
 * A street grill laid out afresh at the window opening's proportions and
 * scaled to the field's world, so it fills the same frame as khidki's own.
 * Its own frame is dropped: the window frame stands in for it.
 */
function shapeOf(name: string): GrillShape | undefined {
  const builder = GRILL_BUILDERS.find((b) => b.name === name);
  if (!builder) return undefined;
  const g = builder.make(APERTURE_W / APERTURE_H);
  const k = APERTURE_H / g.h;
  const pt = ([x, y]: [number, number]): [number, number] => [x * k, y * k];
  return {
    w: APERTURE_W,
    h: APERTURE_H,
    bars: g.bars.map((pl) => pl.map(pt)),
    closers: g.discs.map((d) => ({ x: d.x * k, y: d.y * k, r: d.r * k })),
  };
}

export const khidkiSketch =
  (o: KhidkiSketchOptions) =>
  ({ wrap, context, ...props }: SketchProps): (() => void) => {
    const seed = Random.getRandomSeed();
    Random.setSeed(seed);
    const params: Params = {
      seed,
      bar: 0.5,
      knot: 1,
      pattern: 'patches',
      starSet: 'odd',
      starPick: 'checker',
      growthShare: 0.5,
      groupSize: 2.5,
      walkPitch: 0.6,
      walkLength: 60,
      radius: 1,
      stroke: 0.3,
      warmup: 600,
      speed: 2,
      // A new palette every load, as the pane's New palette button deals.
      paletteSeed: Random.getRandomSeed(),
      hue: Math.round(Random.range(0, 360)),
      // A scheme picked with the palette on every load; mono stays a pane choice.
      harmony: Random.pick(['analogous', 'complementary', 'split', 'triadic'] as Harmony[]),
      saturation: 1,
      ink: 6,
      accent: 1.8,
      frameTone: 6,
      reverse: true,
      debug: false,
      grill: 'khidki',
      ...o.defaults?.(),
    };

    // Collapsed in the gallery, where every cell would otherwise carry one.
    const inGallery = new URLSearchParams(location.search).has('gallery');
    const pane = new Pane({ title: o.title, expanded: !inGallery }) as any;
    pane.element.parentElement.style.zIndex = '1';

    let field: KhidkiField;
    let shape: GrillShape | undefined;
    let edges: [number, number, number, number][] = [];
    const colors = {
      bg: '',
      ink: '',
      walks: '',
      bars: '',
      circles: '',
      diamonds: '',
      hairline: '',
      frame: { front: '', top: '', side: '' },
    };

    const build = () => {
      Random.setSeed(params.seed);
      console.log(params.seed);
      shape = shapeOf(params.grill);
      field = createKhidkiField(params, shape);
      edges = params.debug ? outline(field.mask) : [];
      const t0 = performance.now();
      for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) field.step();
    };

    // The colour system lives in ./khidki-colours: fills quiet, bars the
    // highest contrast, knots well clear of the fills, the frame one hue in
    // three shades.
    const paint = () => {
      Random.setSeed(params.paletteSeed);
      const c = khidkiColours({
        hue: params.hue,
        harmony: params.harmony,
        saturation: params.saturation,
        slate: params.reverse,
        fill: params.accent,
        knot: params.ink,
        frame: params.frameTone,
      });
      Object.assign(colors, { ...c, ink: c.growth });
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

    const layout = pane.addFolder({ title: 'Grill' });
    onInput(layout.addBinding(params, 'grill', { options: Object.fromEntries(GRILL_NAMES.map((n) => [n, n])) }), () => {
      showOwn();
      rebuild();
    });
    onInput(layout.addBinding(params, 'bar', { min: 0.2, max: 3, step: 0.05 }), rebuild);
    // Circles, diamonds and lozenge stars belong to khidki's own grill: shown
    // only while it is the one picked.
    const ownOnly = [
      layout.addBinding(params, 'knot', { min: 0, max: 2.5, step: 0.05, label: 'circles' }),
      layout.addBinding(params, 'pattern', { options: { 'lozenge stars': 'stars', 'noise patches': 'patches' } }),
      layout.addBinding(params, 'starSet', { options: { odd: 'odd', even: 'even' }, label: 'star set' }),
      layout.addBinding(params, 'starPick', {
        options: { all: 'all', checker: 'checker', random: 'random' },
        label: 'grown stars',
      }),
    ];
    for (const b of ownOnly) onInput(b, rebuild);
    const showOwn = () => ownOnly.forEach((b) => (b.hidden = params.grill !== 'khidki'));
    showOwn();
    onInput(
      layout.addBinding(params, 'growthShare', { min: 0, max: 1, step: 0.05, label: 'grown share' }),
      rebuild,
    );
    onInput(
      layout.addBinding(params, 'groupSize', { min: 0.3, max: 8, step: 0.1, label: 'group size' }),
      rebuild,
    );
    onInput(layout.addBinding(params, 'walkPitch', { min: 0.5, max: 2.5, step: 0.05, label: 'walk pitch' }), rebuild);
    onInput(layout.addBinding(params, 'walkLength', { min: 2, max: 200, step: 1, label: 'walk length' }), rebuild);
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
    onInput(
      colour.addBinding(params, 'harmony', { options: Object.fromEntries(Object.keys(HARMONIES).map((h) => [h, h])) }),
      repaint,
    );
    onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
    onInput(colour.addBinding(params, 'accent', { min: 1.2, max: 6, step: 0.1, label: 'fill (:1)' }), repaint);
    onInput(colour.addBinding(params, 'ink', { min: 4.5, max: 18, step: 0.1, label: 'knots (:1)' }), repaint);
    onInput(colour.addBinding(params, 'frameTone', { min: 2, max: 15, step: 0.1, label: 'frame (:1)' }), repaint);
    colour.addButton({ title: 'New palette' }).on('click', () => {
      params.paletteSeed = Random.getRandomSeed();
      params.hue = Math.round(Random.range(0, 360));
      pane.refresh();
      repaint();
    });

    onInput(pane.addBinding(params, 'debug', { label: 'outlines' }), () => {
      edges = params.debug ? outline(field.mask) : [];
      props.render();
    });

    build();
    paint();

    wrap.render = ({ width, height }: SketchProps) => {
      for (let i = 0; i < params.speed; i++) field.step();

      const { grill, blocks, walkPitch } = field;
      // Every grill sits in the same window frame, filling its opening.
      const frame = windowFrame('rect', width, height);
      const box = frame.bounds;
      const scale = Math.min(box.w / field.w, box.h / field.h);

      context.fillStyle = colors.bg;
      context.fillRect(0, 0, width, height);

      context.save();
      context.clip(frame.aperture);
      context.translate(box.x + (box.w - field.w * scale) / 2, box.y + (box.h - field.h * scale) / 2);

      context.lineJoin = 'round';
      context.lineCap = 'round';
      context.lineWidth = params.radius * params.stroke * scale;

      // Walked blocks: one path for every walk.
      context.strokeStyle = colors.walks;
      context.beginPath();
      for (const b of blocks) {
        for (const walk of b.walks ?? []) {
          walk.forEach(([u, v], i) => {
            const px = (u + 0.5) * walkPitch * scale;
            const py = (v + 0.5) * walkPitch * scale;
            if (i === 0) context.moveTo(px, py);
            // A lone node still gets a mark: a zero-length segment with round caps.
            if (i > 0 || walk.length === 1) context.lineTo(px, py);
          });
        }
      }
      context.stroke();

      // Grown blocks.
      context.strokeStyle = colors.ink;
      context.beginPath();
      for (const b of blocks) {
        const nodes = b.growth?.state.nodes ?? [];
        nodes.forEach((p, i) => {
          if (i === 0) context.moveTo(p.x * scale, p.y * scale);
          else context.lineTo(p.x * scale, p.y * scale);
        });
        if (nodes.length > 0) context.closePath();
      }
      context.stroke();

      if (params.debug) {
        context.strokeStyle = colors.hairline;
        context.lineWidth = 1;
        context.beginPath();
        for (const [x0, y0, x1, y1] of edges) {
          context.moveTo(x0 * scale, y0 * scale);
          context.lineTo(x1 * scale, y1 * scale);
        }
        context.stroke();
      }

      if (!grill) {
        // A street grill over the fills: its bars, then any discs.
        context.strokeStyle = colors.bars;
        context.lineWidth = params.bar * scale;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        for (const bar of shape?.bars ?? []) {
          bar.forEach(([x, y], i) => (i === 0 ? context.moveTo(x * scale, y * scale) : context.lineTo(x * scale, y * scale)));
        }
        context.stroke();
        context.fillStyle = colors.circles;
        context.beginPath();
        for (const d of shape?.closers ?? []) {
          context.moveTo((d.x + d.r) * scale, d.y * scale);
          context.arc(d.x * scale, d.y * scale, d.r * scale, 0, Math.PI * 2);
        }
        context.fill();
        context.restore();
        frame.draw(context, colors.frame);
        return;
      }

      // The grill over the fills: bars and lozenges, then the knots.
      context.strokeStyle = colors.bars;
      context.lineWidth = params.bar * scale;
      context.lineCap = 'butt';
      context.lineJoin = 'miter';
      context.beginPath();
      for (const [[x0, y0], [x1, y1]] of grill.bars) {
        context.moveTo(x0 * scale, y0 * scale);
        context.lineTo(x1 * scale, y1 * scale);
      }
      context.stroke();

      context.fillStyle = colors.circles;
      context.beginPath();
      for (const [x, y] of grill.circles) {
        context.moveTo((x + grill.circleR) * scale, y * scale);
        context.arc(x * scale, y * scale, grill.circleR * scale, 0, Math.PI * 2);
      }
      context.fill();

      context.fillStyle = colors.diamonds;
      context.beginPath();
      for (const [x, y] of grill.diamonds) {
        const r = grill.diamondR * scale;
        context.moveTo(x * scale, y * scale - r);
        context.lineTo(x * scale + r, y * scale);
        context.lineTo(x * scale, y * scale + r);
        context.lineTo(x * scale - r, y * scale);
        context.closePath();
      }
      context.fill();

      context.restore();

      frame.draw(context, colors.frame);
    };

    return () => pane.dispose();
  };
