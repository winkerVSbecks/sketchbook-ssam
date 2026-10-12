/**
 * paṛos (neighbourhood) — khidki's windows side by side along a wide, short
 * street: each the same deep rectangular frame (./window-frame) round a
 * different grill — khidki's own or one of the street gates and windows of
 * ./grills — every block it leaves open filled with nalee walks or
 * differential growth (./khidki-field).
 *
 * Each window is drawn by ./khidki-sketch's drawWindow in a square of its
 * own, the squares overlapped so the frames stand a set gap apart. All
 * share one ground and one set of tones (./khidki-colours); each house picks
 * its own hue and harmony, the way neighbours paint their own frames.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { createKhidkiField, type GrillShape, type KhidkiField } from './khidki-field';
import { khidkiColours, type Harmony, type KhidkiColours } from './khidki-colours';
import { GRILL_NAMES, GROUND_TONES, drawWindow, shapeOf } from './khidki-sketch';

const WARMUP_MS = 8000;
/** The frame's span across its square, and where it starts (./window-frame's rect). */
const FRAME_SPAN = 0.555 + 0.024;
const FRAME_LEFT = (1 - FRAME_SPAN) / 2;

interface StreetParams {
  seed: string;
  /** Windows along the street. */
  count: number;
  /** Space between frames, as a fraction of a window's square. */
  gap: number;
  bar: number;
  growthShare: number;
  groupSize: number;
  walkPitch: number;
  walkLength: number;
  radius: number;
  stroke: number;
  warmup: number;
  speed: number;
  paletteSeed: string;
  saturation: number;
  /** Slate ground instead of paper. */
  slate: boolean;
  /** One hue and harmony down the whole street instead of one per house. */
  matched: boolean;
}

interface House {
  grill: string;
  hue: number;
  harmony: Harmony;
  field: KhidkiField;
  shape: GrillShape | undefined;
  colours: KhidkiColours;
}

const SCHEMES: Harmony[] = ['analogous', 'complementary', 'split', 'triadic'];

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const params: StreetParams = {
    seed: Random.getRandomSeed(),
    count: 5,
    gap: 0.1,
    bar: 0.5,
    growthShare: 0.5,
    groupSize: 2.5,
    walkPitch: 0.6,
    walkLength: 60,
    radius: 1,
    stroke: 0.3,
    warmup: 400,
    speed: 2,
    paletteSeed: Random.getRandomSeed(),
    saturation: 1,
    slate: true,
    matched: false,
  };

  const inGallery = new URLSearchParams(location.search).has('gallery');
  const pane = new Pane({ title: 'paṛos', expanded: !inGallery }) as any;
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

  let houses: House[] = [];
  let bg = '';

  /** Grills down the street: every one appears before any repeats. */
  const pickGrills = (n: number): string[] => {
    const out: string[] = [];
    while (out.length < n) out.push(...(Random.shuffle(GRILL_NAMES) as string[]));
    return out.slice(0, n);
  };

  const paint = () => {
    Random.setSeed(params.paletteSeed);
    const tones = GROUND_TONES[params.slate ? 'slate' : 'paper'];
    const baseHue = Random.range(0, 360);
    const baseHarmony = Random.pick(SCHEMES);
    houses.forEach((h, i) => {
      h.hue = params.matched ? baseHue : Random.range(0, 360);
      h.harmony = params.matched ? baseHarmony : Random.pick(SCHEMES);
      h.colours = khidkiColours({
        hue: h.hue,
        harmony: h.harmony,
        saturation: params.saturation,
        slate: params.slate,
        fill: tones.accent,
        knot: tones.ink,
        frame: 6,
      });
      // One street, one ground: the first house's.
      if (i === 0) bg = h.colours.bg;
    });
  };

  const build = () => {
    Random.setSeed(params.seed);
    console.log(params.seed);
    const grills = pickGrills(params.count);
    houses = grills.map((grill) => {
      const shape = shapeOf(grill);
      const field = createKhidkiField(
        {
          ...params,
          knot: 1,
          pattern: 'patches',
          starSet: 'odd',
          starPick: 'checker',
        },
        shape,
      );
      return { grill, hue: 0, harmony: 'analogous', field, shape, colours: undefined as unknown as KhidkiColours };
    });
    const t0 = performance.now();
    for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) {
      for (const h of houses) h.field.step();
    }
    paint();
  };

  const rebuild = () => {
    build();
    props.render();
  };
  const repaint = () => {
    paint();
    props.render();
  };
  const onInput = (binding: any, then: () => void) =>
    binding.on('change', (ev: { last?: boolean }) => {
      if (ev.last !== false) then();
    });

  const street = pane.addFolder({ title: 'Street' });
  onInput(street.addBinding(params, 'count', { min: 1, max: 9, step: 1, label: 'windows' }), rebuild);
  street.addBinding(params, 'gap', { min: 0, max: 0.5, step: 0.01 });
  onInput(street.addBinding(params, 'bar', { min: 0.2, max: 3, step: 0.05 }), rebuild);
  onInput(street.addBinding(params, 'growthShare', { min: 0, max: 1, step: 0.05, label: 'grown share' }), rebuild);
  onInput(street.addBinding(params, 'groupSize', { min: 0.3, max: 8, step: 0.1, label: 'group size' }), rebuild);
  onInput(street.addBinding(params, 'walkPitch', { min: 0.5, max: 2.5, step: 0.05, label: 'walk pitch' }), rebuild);
  street.addBinding(params, 'seed', { readonly: true });
  street.addButton({ title: 'Regenerate' }).on('click', () => {
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
  onInput(colour.addBinding(params, 'slate'), repaint);
  onInput(colour.addBinding(params, 'matched', { label: 'one palette' }), repaint);
  onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
  colour.addButton({ title: 'New palette' }).on('click', () => {
    params.paletteSeed = Random.getRandomSeed();
    pane.refresh();
    repaint();
  });

  build();

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < params.speed; i++) for (const h of houses) h.field.step();

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Each window gets a square of side s; frames sit `gap · s` apart, the
    // row centred, s as large as fits the height and the width.
    const n = houses.length;
    const span = n * FRAME_SPAN + (n - 1) * params.gap;
    const s = Math.min(height, (width * 0.94) / span);
    const x0 = (width - span * s) / 2;
    const y0 = (height - s) / 2;

    houses.forEach((h, i) => {
      context.save();
      context.translate(x0 + i * (FRAME_SPAN + params.gap) * s - FRAME_LEFT * s, y0);
      drawWindow(
        context,
        s,
        s,
        h.field,
        h.shape,
        { ...h.colours, ink: h.colours.growth },
        { radius: params.radius, stroke: params.stroke, bar: params.bar, debug: false, edges: [] },
      );
      context.restore();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [2560, 720],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: true,
  duration: 20000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
