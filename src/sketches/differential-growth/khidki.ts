/**
 * khidki — the jali's rectangular frame with ../khidki's grill put back.
 *
 * Inside the deep rectangular frame (./window-frame) sits the khidki grill:
 * vertical and horizontal bars, a waisted lozenge across every cell joining
 * its two circle corners, circles and diamonds alternating on the crossings
 * (./khidki-field). Every block the grill leaves open is filled with nalee
 * walks or with a differential-growth curve grown from the block's widest
 * point and confined to it. Whole lozenge stars — a circle, its four
 * lozenges and the darts between them — are grown, the rest walked; a noise
 * field gathering each kind into patches is the alternative.
 *
 * Five more grills are gates (./khidki-motifs) — turnstile, railing, fan,
 * flower panels and sunrise — fitted to the opening with their edge bars run
 * on to the frame; the blocks they leave fill the same way, gathered into
 * noise patches.
 *
 * Colour: slate ground (paper when off), a fresh palette every load. The
 * fill keeps to two hues off the ring — the base for the growth, the next
 * for the walks — at one quiet contrast level (the mid tier), so the grill,
 * drawn in the high-contrast tier of the hues after those, stands out over
 * them. Circles match the frame's top as in the reference. Every parameter
 * lives in the tweakpane: layout and growth rebuild from the same seed,
 * colour only redraws.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { cuspPalette } from '../../colors/cusphanger';
import {
  APERTURE_H,
  APERTURE_W,
  createKhidkiField,
  type FillPattern,
  type KhidkiField,
  type Motif,
  type StarPick,
} from './khidki-field';
import { outline } from './region';
import { windowFrame } from './window-frame';

/** Upper bound on the warm-up, however many steps are asked for. */
const WARMUP_MS = 6000;

interface Params {
  seed: string;
  /** The khidki grill or one of the gates. */
  motif: Motif;
  /** Gates: copies side by side. */
  repeat: number;
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
  /** Hues off the ring: growth, walks, then grill and frame. */
  hues: number;
  angle: number;
  saturation: number;
  /** WCAG targets against the ground: grill (high tier); `accent` is the
   * fill's (mid tier), shared by growth and walks; `wash` the blocks' outlines. */
  ink: number;
  accent: number;
  wash: number;
  /** Slate ground instead of paper. */
  reverse: boolean;
  /** Hairline outline of every block. */
  debug: boolean;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  const params: Params = {
    seed,
    motif: 'khidki',
    repeat: 1,
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
    hues: 5,
    angle: 51,
    saturation: 1,
    ink: 12,
    accent: 3,
    wash: 2,
    reverse: true,
    debug: false,
  };

  // Collapsed in the gallery, where every cell would otherwise carry one.
  const inGallery = new URLSearchParams(location.search).has('gallery');
  const pane = new Pane({ title: 'khidki', expanded: !inGallery }) as any;
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

  let field: KhidkiField;
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
    field = createKhidkiField(params);
    edges = params.debug ? outline(field.mask) : [];
    const t0 = performance.now();
    for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) field.step();
  };

  // Hues off the ring in order from the base: growth, walks, then the grill
  // and the frame, wrapping round when there are fewer hues than roles.
  const paint = () => {
    Random.setSeed(params.paletteSeed);
    const palette = cuspPalette({
      hue: params.hue,
      count: params.hues,
      angle: params.angle,
      shuffle: false,
      saturation: params.saturation,
      ground: params.reverse ? 'dark' : 'light',
      targets: { high: params.ink, mid: params.accent, low: params.wash },
    });
    const { high, mid, low } = palette.tiers;
    const n = palette.hues.length;
    const order = palette.ring.slice(0, n).map((h) => palette.hues.indexOf(h));
    const at = (j: number) => order[j % n];
    colors.bg = palette.bg.css;
    // Fills recede to one contrast level (the mid tier) in their two hues;
    // the grill takes the high tier.
    colors.ink = mid[at(0)].css;
    colors.walks = mid[at(1)].css;
    colors.bars = high[at(2)].css;
    colors.circles = high[at(3)].css;
    colors.diamonds = high[at(4)].css;
    colors.hairline = low[at(0)].css;
    colors.frame = { front: high[at(2)].css, top: mid[at(3)].css, side: mid[at(4)].css };
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
  onInput(
    layout.addBinding(params, 'motif', {
      options: {
        khidki: 'khidki',
        turnstile: 'turnstile',
        railing: 'railing',
        fan: 'fan',
        flower: 'flower',
        sunrise: 'sunrise',
      },
    }),
    rebuild,
  );
  onInput(layout.addBinding(params, 'repeat', { min: 1, max: 4, step: 1 }), rebuild);
  onInput(layout.addBinding(params, 'bar', { min: 0.2, max: 3, step: 0.05 }), rebuild);
  onInput(layout.addBinding(params, 'knot', { min: 0, max: 2.5, step: 0.05, label: 'circles' }), rebuild);
  onInput(
    layout.addBinding(params, 'pattern', { options: { 'lozenge stars': 'stars', 'noise patches': 'patches' } }),
    rebuild,
  );
  onInput(layout.addBinding(params, 'starSet', { options: { odd: 'odd', even: 'even' }, label: 'star set' }), rebuild);
  onInput(
    layout.addBinding(params, 'starPick', {
      options: { all: 'all', checker: 'checker', random: 'random' },
      label: 'grown stars',
    }),
    rebuild,
  );
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
  onInput(colour.addBinding(params, 'hues', { min: 1, max: 6, step: 1 }), repaint);
  onInput(colour.addBinding(params, 'angle', { min: 1, max: 180, step: 1, label: 'hue Δ' }), repaint);
  onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
  onInput(colour.addBinding(params, 'ink', { min: 4.5, max: 18, step: 0.1, label: 'grill (:1)' }), repaint);
  onInput(colour.addBinding(params, 'accent', { min: 1.2, max: 9, step: 0.1, label: 'fill (:1)' }), repaint);
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

    const frame = windowFrame('rect', width, height);
    const box = frame.bounds;
    const scale = Math.min(box.w / APERTURE_W, box.h / APERTURE_H);
    const { grill, blocks, walkPitch } = field;

    context.fillStyle = colors.bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.clip(frame.aperture);
    context.translate(box.x + (box.w - APERTURE_W * scale) / 2, box.y + (box.h - APERTURE_H * scale) / 2);

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

    // Gates: heavy bars, outlines, then the hubs and bosses in the circles' colour.
    context.lineWidth = params.bar * 2 * scale;
    context.beginPath();
    for (const [[x0, y0], [x1, y1]] of grill.heavy) {
      context.moveTo(x0 * scale, y0 * scale);
      context.lineTo(x1 * scale, y1 * scale);
    }
    context.stroke();

    context.lineWidth = params.bar * scale;
    context.beginPath();
    for (const path of grill.paths) {
      path.forEach(([x, y], i) => (i === 0 ? context.moveTo(x * scale, y * scale) : context.lineTo(x * scale, y * scale)));
      const [first, last] = [path[0], path[path.length - 1]];
      if (first[0] === last[0] && first[1] === last[1]) context.closePath();
    }
    context.stroke();

    context.fillStyle = colors.circles;
    context.beginPath();
    for (const [x, y, w, h] of grill.plates) context.rect(x * scale, y * scale, w * scale, h * scale);
    for (const [x, y, r] of grill.discs) {
      context.moveTo((x + r) * scale, y * scale);
      context.arc(x * scale, y * scale, r * scale, 0, Math.PI * 2);
    }
    context.fill();

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
