/**
 * khidki-grammar-bare — khidki-grammar with the fills taken out: only the
 * generated leading (./grille-grammar) on its ground, inside the flat band.
 *
 * The same rules make the grille — a symmetry rolled with `none` most
 * likely, bands cut in varied ratios, a street-grille motif per panel shape —
 * and the same colours paint it (./khidki-colours): the leading the frame
 * hue's far end, the band its front shade, the punctum the knot tone. With
 * no texture to grow there is nothing to animate: one still per seed.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { SYMMETRIES, generateGrille, pickSymmetry, type Grille, type Symmetry } from './grille-grammar';
import { HARMONIES, khidkiColours, type Harmony } from './khidki-colours';
import { GROUND_TONES } from './khidki-sketch';

/** The opening, in world units: the canvas's 4:5. */
const W = 54;
const H = 67.5;

interface Params {
  seed: string;
  symmetry: Symmetry;
  depth: number;
  punctum: boolean;
  band: boolean;
  bar: number;
  paletteSeed: string;
  hue: number;
  harmony: Harmony;
  saturation: number;
  slate: boolean;
  knot: number;
  bandTone: number;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const params: Params = {
    seed: Random.getRandomSeed(),
    symmetry: pickSymmetry(),
    depth: Random.rangeFloor(2, 5),
    punctum: false,
    band: true,
    bar: 0.6,
    paletteSeed: Random.getRandomSeed(),
    hue: Math.round(Random.range(0, 360)),
    harmony: Random.pick(['analogous', 'complementary', 'split', 'triadic'] as Harmony[]),
    saturation: 1,
    slate: true,
    knot: GROUND_TONES.slate.ink,
    bandTone: 6,
  };

  const inGallery = new URLSearchParams(location.search).has('gallery');
  const pane = new Pane({ title: 'khidki-grammar-bare', expanded: !inGallery }) as any;
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
  const recipe = { text: '' };
  const colours = { bg: '', lead: '', band: '', punctum: '' };

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
  };

  const paint = () => {
    Random.setSeed(params.paletteSeed);
    const c = khidkiColours({
      hue: params.hue,
      harmony: params.harmony,
      saturation: params.saturation,
      slate: params.slate,
      fill: GROUND_TONES[params.slate ? 'slate' : 'paper'].accent,
      knot: params.knot,
      frame: params.bandTone,
    });
    colours.bg = c.bg;
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
  onInput(g.addBinding(params, 'punctum'), rebuild);
  onInput(g.addBinding(params, 'band', { label: 'border band' }), () => props.render());
  g.addBinding(params, 'bar', { min: 0.1, max: 3, step: 0.05 }).on('change', () => props.render());
  g.addBinding(recipe, 'text', { readonly: true, label: 'recipe' });
  g.addBinding(params, 'seed', { readonly: true });
  g.addButton({ title: 'New grille' }).on('click', () => {
    params.seed = Random.getRandomSeed();
    params.symmetry = pickSymmetry();
    params.depth = Random.rangeFloor(2, 5);
    rebuild();
    pane.refresh();
  });

  const colour = pane.addFolder({ title: 'Colour' });
  onInput(colour.addBinding(params, 'slate'), repaint);
  onInput(colour.addBinding(params, 'hue', { min: 0, max: 360, step: 1 }), repaint);
  onInput(
    colour.addBinding(params, 'harmony', { options: Object.fromEntries(Object.keys(HARMONIES).map((h) => [h, h])) }),
    repaint,
  );
  onInput(colour.addBinding(params, 'saturation', { min: 0, max: 1, step: 0.01 }), repaint);
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
    context.fillStyle = colours.bg;
    context.fillRect(0, 0, width, height);

    const inset = params.band ? width * 0.045 : 0;
    const scale = Math.min((width - 2 * inset) / W, (height - 2 * inset) / H);
    const ox = (width - W * scale) / 2;
    const oy = (height - H * scale) / 2;

    context.save();
    context.beginPath();
    context.rect(ox, oy, W * scale, H * scale);
    context.clip();
    context.translate(ox, oy);

    context.strokeStyle = colours.lead;
    context.lineWidth = params.bar * scale;
    context.lineJoin = 'round';
    context.lineCap = 'round';
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
      // A flat band, filling everything between the opening and the edge.
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
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
