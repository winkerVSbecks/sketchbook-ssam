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
 *   - one rule per layer: the texture follows the leading, and neighbours
 *     across a bar take opposite textures wherever the leading allows, so
 *     every line marks a change (./khidki-field `alternate`); blocks too thin
 *     for a curve to settle are walked;
 *   - one material: walks run at the curves' own spacing, so maze and growth
 *     are two dialects at one scale;
 *   - close values: ground, fill and leading in one hue family at near
 *     contrasts — the event is texture against leading, not colour;
 *   - kinetic: a short warm-up, then the growth keeps filling inside the
 *     fixed leading, the grille as the invariant aperture.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { cuspPalette } from '../../colors/cusphanger';
import { createKhidkiField, type KhidkiField } from './khidki-field';
import { SYMMETRIES, generateGrille, type Grille, type Symmetry } from './grille-grammar';

/** The opening, in world units: the canvas's 4:5. */
const W = 54;
const H = 67.5;
const WARMUP_MS = 6000;

interface Params {
  seed: string;
  symmetry: Symmetry;
  depth: number;
  punctum: boolean;
  /** Flat border band instead of the bare canvas edge. */
  band: boolean;
  bar: number;
  radius: number;
  stroke: number;
  warmup: number;
  speed: number;
  paletteSeed: string;
  hue: number;
  saturation: number;
  slate: boolean;
  /** WCAG contrast of the fills and the leading against the ground. */
  fill: number;
  lead: number;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const params: Params = {
    seed: Random.getRandomSeed(),
    symmetry: Random.pick(SYMMETRIES),
    depth: Random.rangeFloor(2, 5),
    punctum: Random.chance(0.4),
    band: false,
    bar: 0.6,
    radius: 1,
    stroke: 0.35,
    warmup: 150,
    speed: 3,
    paletteSeed: Random.getRandomSeed(),
    hue: Math.round(Random.range(0, 360)),
    saturation: 0.7,
    slate: Random.chance(0.5),
    fill: 2.2,
    lead: 3.6,
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
  const colours = { bg: '', growth: '', walks: '', lead: '', punctum: '' };

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
    recipe.text = grille.recipe;
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
        // One material: the maze at the curves' own spacing.
        walkPitch: params.radius,
        walkLength: 80,
        minGrowth: 2.5,
      },
      { w: W, h: H, bars: grille.bars, closers: grille.discs },
    );
    const t0 = performance.now();
    for (let i = 0; i < params.warmup && performance.now() - t0 < WARMUP_MS; i++) field.step();
  };

  // Close values: growth and walks in neighbouring hues at one contrast, the
  // leading the same family a step further from the ground; the punctum the
  // only far hue, opposite on the wheel.
  const paint = () => {
    Random.setSeed(params.paletteSeed);
    const p = cuspPalette({
      hue: params.hue,
      count: 12,
      angle: 30,
      shuffle: false,
      jitter: 0,
      saturation: params.saturation,
      ground: params.slate ? 'dark' : 'light',
      targets: { high: params.lead, mid: params.fill, low: 1.4 },
    });
    const at = (step: number) => p.hues.indexOf(p.ring[step]);
    colours.bg = p.bg.css;
    colours.growth = p.tiers.mid[at(0)].css;
    colours.walks = p.tiers.mid[at(1)].css;
    colours.lead = p.tiers.high[at(0)].css;
    colours.punctum = p.tiers.high[at(6)].css;
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
  onInput(g.addBinding(params, 'punctum'), rebuild);
  onInput(g.addBinding(params, 'band', { label: 'border band' }), () => props.render());
  onInput(g.addBinding(params, 'bar', { min: 0.2, max: 2, step: 0.05 }), rebuild);
  g.addBinding(recipe, 'text', { readonly: true, label: 'recipe' });
  g.addBinding(params, 'seed', { readonly: true });
  g.addButton({ title: 'New grille' }).on('click', () => {
    params.seed = Random.getRandomSeed();
    params.symmetry = Random.pick(SYMMETRIES);
    params.depth = Random.rangeFloor(2, 5);
    pane.refresh();
    rebuild();
    pane.refresh();
  });

  const growth = pane.addFolder({ title: 'Growth' });
  onInput(growth.addBinding(params, 'radius', { min: 0.6, max: 2, step: 0.05, label: 'spacing' }), rebuild);
  growth.addBinding(params, 'stroke', { min: 0.1, max: 1, step: 0.01 });
  onInput(growth.addBinding(params, 'warmup', { min: 0, max: 2000, step: 50 }), rebuild);
  growth.addBinding(params, 'speed', { min: 0, max: 8, step: 1, label: 'steps / frame' });

  const colour = pane.addFolder({ title: 'Colour' });
  onInput(colour.addBinding(params, 'slate'), repaint);
  onInput(colour.addBinding(params, 'hue', { min: 0, max: 360, step: 1 }), repaint);
  onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
  onInput(colour.addBinding(params, 'fill', { min: 1.2, max: 5, step: 0.1, label: 'fill (:1)' }), repaint);
  onInput(colour.addBinding(params, 'lead', { min: 1.5, max: 12, step: 0.1, label: 'leading (:1)' }), repaint);
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

    context.strokeStyle = colours.walks;
    context.beginPath();
    for (const b of field.blocks) {
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
    context.stroke();

    context.fillStyle = colours.punctum;
    context.beginPath();
    for (const d of grille.discs) {
      context.moveTo((d.x + d.r) * scale, d.y * scale);
      context.arc(d.x * scale, d.y * scale, d.r * scale, 0, Math.PI * 2);
    }
    context.fill();
    context.restore();

    if (params.band) {
      // A flat band in the leading's colour: an edge, not an object.
      context.strokeStyle = colours.lead;
      context.lineWidth = inset;
      context.strokeRect(ox - inset / 2, oy - inset / 2, W * scale + inset, H * scale + inset);
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
