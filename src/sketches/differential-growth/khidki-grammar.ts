/**
 * khidki-grammar — khidki forked after a critique: generated leading over the
 * two-texture field, a few close values, and no frame.
 *
 *   - the leading is generated, not chosen (./grille-grammar): a symmetry, a
 *     recursive subdivision into panels, a street-grille motif in each — so
 *     the composition is found the way grilles are made, not found in a
 *     catalogue of seven;
 *   - no illusion: the canvas edge is the frame, or a flat border band; no
 *     extrusion, no box-in-perspective motifs, no knots but one optional
 *     central disc, the only saturated mark;
 *   - one rule per layer: the texture follows the leading. Each band takes a
 *     rule — neighbours alternate across every bar (./khidki-field
 *     `alternate`), or the whole band is grown, or walked — and one block per
 *     work, chosen by the system, breaks its rule; blocks too thin for a
 *     curve to settle are walked;
 *   - one material: walks run on a lattice tied to the curves' spacing
 *     (0.7 of it, where the curves actually settle), so maze and growth are
 *     two dialects at one scale;
 *   - colour as in khidki (./khidki-colours): a harmony scheme, quiet fills
 *     in two neighbouring hues, the leading the highest contrast, the band
 *     the frame hue's front shade, flat;
 *   - kinetic: a warm-up that settles the stills, then the growth keeps
 *     filling inside the fixed leading, the grille as the invariant aperture.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { createKhidkiField, type KhidkiField } from './khidki-field';
import { SYMMETRIES, generateGrille, pickSymmetry, type Grille, type Symmetry } from './grille-grammar';
import type { BlockKind } from './khidki-field';
import { HARMONIES, khidkiColours, type Harmony } from './khidki-colours';
import { GROUND_TONES } from './khidki-sketch';

/** The opening, in world units: the canvas's 4:5. */
const W = 54;
const H = 67.5;
const WARMUP_MS = 6000;

interface Params {
  seed: string;
  symmetry: Symmetry;
  depth: number;
  punctum: boolean;
  /** One block, chosen by the system, takes the other texture. */
  exception: boolean;
  /** Differential growth in its blocks; off, every block is walked. */
  growth: boolean;
  /** Flat border band instead of the bare canvas edge. */
  band: boolean;
  /** Draw the leading; off, the fills still follow it but it isn't drawn. */
  showBars: boolean;
  bar: number;
  radius: number;
  /** Walk lattice pitch as a fraction of the curves' spacing. */
  walkDensity: number;
  stroke: number;
  warmup: number;
  speed: number;
  paletteSeed: string;
  hue: number;
  /** How the hues sit round the wheel (./khidki-colours). */
  harmony: Harmony;
  saturation: number;
  slate: boolean;
  /** WCAG contrast against the ground: both fills, the punctum, the band. */
  fill: number;
  knot: number;
  bandTone: number;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const params: Params = {
    seed: Random.getRandomSeed(),
    symmetry: pickSymmetry(),
    depth: Random.rangeFloor(2, 5),
    punctum: false,
    exception: true,
    growth: false,
    band: true,
    showBars: true,
    bar: 0.6,
    radius: 1,
    walkDensity: 0.7,
    stroke: 0.35,
    warmup: 600,
    speed: 3,
    paletteSeed: Random.getRandomSeed(),
    hue: Math.round(Random.range(0, 360)),
    harmony: Random.pick(['analogous', 'complementary', 'split', 'triadic'] as Harmony[]),
    saturation: 1,
    slate: true,
    fill: GROUND_TONES.slate.accent,
    knot: GROUND_TONES.slate.ink,
    bandTone: 6,
  };

  const inGallery = new URLSearchParams(location.search).has('gallery');
  const pane = new Pane({ title: 'khidki-grammar', expanded: !inGallery }) as any;
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

  let grille: Grille;
  let field: KhidkiField;
  const recipe = { text: '' };
  const colours = { bg: '', growth: '', walks: '', lead: '', band: '', punctum: '' };

  const build = () => {
    Random.setSeed(params.seed);
    console.log(params.seed);
    grille = generateGrille({
      w: W,
      h: H,
      symmetry: params.symmetry,
      depth: params.depth,
      minPanel: 7,
      punctum: params.punctum,
    });
    // Each band its own texture rule: mostly alternating, sometimes all one
    // texture, so seeds of one layout differ in more than which cell is which.
    const modes: (BlockKind | undefined)[] = grille.bands.map(
      () => [undefined, 'growth', 'nalee'][Random.weighted([2, 1, 1]) as number] as BlockKind | undefined,
    );
    const bias = (x: number, y: number) => {
      const i = grille.bands.findIndex((imgs) => imgs.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h));
      return i >= 0 ? modes[i] : undefined;
    };
    const named = modes.map((m) => (m === 'growth' ? 'grown' : m === 'nalee' ? 'walked' : 'alt'));
    recipe.text = `${grille.recipe} · bands ${named.join('/')}`;
    field = createKhidkiField(
      {
        bar: params.bar,
        knot: 0,
        pattern: 'alternate',
        starSet: 'odd',
        starPick: 'all',
        growthShare: 0.5,
        groupSize: 1,
        radius: params.radius,
        // One material: the maze tied to the curves' spacing, a little
        // tighter, since the curves settle closer than their repulsion radius.
        walkPitch: params.radius * params.walkDensity,
        walkLength: 80,
        minGrowth: 2.5,
        bias,
        exception: params.exception,
        walksOnly: !params.growth,
      },
      { w: W, h: H, bars: grille.bars, closers: grille.discs },
    );
    const t0 = performance.now();
    for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) field.step();
  };

  // khidki's colour system (./khidki-colours): a harmony of four hues, the
  // fills quiet in two of them, the leading the frame hue's far end, the band
  // that hue's front shade, the punctum the knots' tone.
  const paint = () => {
    Random.setSeed(params.paletteSeed);
    const c = khidkiColours({
      hue: params.hue,
      harmony: params.harmony,
      saturation: params.saturation,
      slate: params.slate,
      fill: params.fill,
      knot: params.knot,
      frame: params.bandTone,
    });
    colours.bg = c.bg;
    colours.growth = c.growth;
    colours.walks = c.walks;
    colours.lead = c.bars;
    colours.band = c.frame.front;
    colours.punctum = c.circles;
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

  const g = pane.addFolder({ title: 'Grammar' });
  onInput(g.addBinding(params, 'symmetry', { options: Object.fromEntries(SYMMETRIES.map((s) => [s, s])) }), rebuild);
  onInput(g.addBinding(params, 'depth', { min: 0, max: 6, step: 1, label: 'subdivision' }), rebuild);
  onInput(g.addBinding(params, 'exception'), rebuild);
  onInput(g.addBinding(params, 'growth', { label: 'diff growth' }), rebuild);
  onInput(g.addBinding(params, 'punctum'), rebuild);
  onInput(g.addBinding(params, 'band', { label: 'border band' }), () => props.render());
  onInput(g.addBinding(params, 'showBars', { label: 'show bars' }), () => props.render());
  onInput(g.addBinding(params, 'bar', { min: 0.2, max: 2, step: 0.05 }), rebuild);
  g.addBinding(recipe, 'text', { readonly: true, label: 'recipe' });
  g.addBinding(params, 'seed', { readonly: true });
  g.addButton({ title: 'New grille' }).on('click', () => {
    params.seed = Random.getRandomSeed();
    params.symmetry = pickSymmetry();
    params.depth = Random.rangeFloor(2, 5);
    pane.refresh();
    rebuild();
    pane.refresh();
  });

  const growth = pane.addFolder({ title: 'Growth' });
  onInput(growth.addBinding(params, 'radius', { min: 0.6, max: 2, step: 0.05, label: 'spacing' }), rebuild);
  onInput(growth.addBinding(params, 'walkDensity', { min: 0.4, max: 1.2, step: 0.05, label: 'walk pitch ×' }), rebuild);
  growth.addBinding(params, 'stroke', { min: 0.1, max: 1, step: 0.01 });
  onInput(growth.addBinding(params, 'warmup', { min: 0, max: 2000, step: 50 }), rebuild);
  growth.addBinding(params, 'speed', { min: 0, max: 8, step: 1, label: 'steps / frame' });

  const colour = pane.addFolder({ title: 'Colour' });
  // Each ground keeps its own fill and knot tones, as in khidki.
  const tones = { slate: { ...GROUND_TONES.slate }, paper: { ...GROUND_TONES.paper } };
  onInput(colour.addBinding(params, 'slate'), () => {
    tones[params.slate ? 'paper' : 'slate'] = { ink: params.knot, accent: params.fill };
    const t = tones[params.slate ? 'slate' : 'paper'];
    params.fill = t.accent;
    params.knot = t.ink;
    pane.refresh();
    repaint();
  });
  onInput(colour.addBinding(params, 'hue', { min: 0, max: 360, step: 1 }), repaint);
  onInput(
    colour.addBinding(params, 'harmony', { options: Object.fromEntries(Object.keys(HARMONIES).map((h) => [h, h])) }),
    repaint,
  );
  onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
  onInput(colour.addBinding(params, 'fill', { min: 1.2, max: 6, step: 0.1, label: 'fill (:1)' }), repaint);
  onInput(colour.addBinding(params, 'knot', { min: 2, max: 18, step: 0.1, label: 'punctum (:1)' }), repaint);
  onInput(colour.addBinding(params, 'bandTone', { min: 2, max: 15, step: 0.1, label: 'band (:1)' }), repaint);
  colour.addButton({ title: 'New palette' }).on('click', () => {
    params.paletteSeed = Random.getRandomSeed();
    params.hue = Math.round(Random.range(0, 360));
    pane.refresh();
    repaint();
  });

  build();
  paint();

  wrap.render = ({ width, height }: SketchProps) => {
    for (let i = 0; i < params.speed; i++) field.step();

    context.fillStyle = colours.bg;
    context.fillRect(0, 0, width, height);

    // The canvas edge is the frame; a band, when on, is flat and the
    // opening sits inside it.
    const inset = params.band ? width * 0.045 : 0;
    const scale = Math.min((width - 2 * inset) / W, (height - 2 * inset) / H);
    const ox = (width - W * scale) / 2;
    const oy = (height - H * scale) / 2;

    context.save();
    context.beginPath();
    context.rect(ox, oy, W * scale, H * scale);
    context.clip();
    context.translate(ox, oy);

    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = params.radius * params.stroke * scale;

    // Walks in the walks' colour; with growth off, blocks of the growth kind
    // are walked too, in the growth colour, so the kinds still alternate.
    for (const kind of ['nalee', 'growth'] as const) {
      context.strokeStyle = kind === 'nalee' ? colours.walks : colours.growth;
      context.beginPath();
      for (const b of field.blocks) {
        if (b.kind !== kind) continue;
        for (const walk of b.walks ?? []) {
          walk.forEach(([u, v], i) => {
            const px = (u + 0.5) * field.walkPitch * scale;
            const py = (v + 0.5) * field.walkPitch * scale;
            if (i === 0) context.moveTo(px, py);
            if (i > 0 || walk.length === 1) context.lineTo(px, py);
          });
        }
      }
      context.stroke();
    }

    context.strokeStyle = colours.growth;
    context.beginPath();
    for (const b of field.blocks) {
      const nodes = b.growth?.state.nodes ?? [];
      nodes.forEach((p, i) => (i === 0 ? context.moveTo(p.x * scale, p.y * scale) : context.lineTo(p.x * scale, p.y * scale)));
      if (nodes.length > 0) context.closePath();
    }
    context.stroke();

    // The leading, flat, over both textures.
    context.strokeStyle = colours.lead;
    context.lineWidth = params.bar * scale;
    context.beginPath();
    for (const bar of grille.bars) {
      bar.forEach(([x, y], i) => (i === 0 ? context.moveTo(x * scale, y * scale) : context.lineTo(x * scale, y * scale)));
    }
    if (params.showBars) context.stroke();

    context.fillStyle = colours.punctum;
    context.beginPath();
    for (const d of grille.discs) {
      context.moveTo((d.x + d.r) * scale, d.y * scale);
      context.arc(d.x * scale, d.y * scale, d.r * scale, 0, Math.PI * 2);
    }
    context.fill();
    context.restore();

    if (params.band) {
      // A flat band in the frame hue's front shade, filling everything
      // between the opening and the canvas edge: an edge, not an object.
      const band = new Path2D();
      band.rect(0, 0, width, height);
      band.rect(ox, oy, W * scale, H * scale);
      context.fillStyle = colours.band;
      context.fill(band, 'evenodd');
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1350],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: true,
  duration: 20000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
