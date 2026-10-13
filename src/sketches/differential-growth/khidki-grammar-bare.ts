/**
 * khidki-grammar-bare — khidki-grammar with the textures taken out: the
 * generated leading (./grille-grammar) inside the flat band, each panel it
 * encloses one flat colour — two fills and the bare ground, neighbours
 * differing wherever three colours can separate them.
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
  /** Draw the leading; off, the fills still follow it but it isn't drawn. */
  showBars: boolean;
  bar: number;
  paletteSeed: string;
  hue: number;
  harmony: Harmony;
  saturation: number;
  slate: boolean;
  knot: number;
  bandTone: number;
  /** Fill each panel the leading encloses with one flat colour. */
  flat: boolean;
  /** WCAG contrast of the flat fills against the ground. */
  fill: number;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  const params: Params = {
    seed: Random.getRandomSeed(),
    symmetry: pickSymmetry(),
    depth: Random.rangeFloor(2, 5),
    punctum: false,
    band: true,
    showBars: true,
    bar: 0.6,
    paletteSeed: Random.getRandomSeed(),
    hue: Math.round(Random.range(0, 360)),
    harmony: Random.pick(['analogous', 'complementary', 'split', 'triadic'] as Harmony[]),
    saturation: 1,
    slate: true,
    knot: GROUND_TONES.slate.ink,
    bandTone: 6,
    flat: true,
    fill: 2.6,
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
  const colours = { bg: '', lead: '', band: '', punctum: '', fills: [] as string[] };
  /** The flat fills as an image the size of the region grid, redrawn on repaint. */
  let regions: Regions;
  let fillImage: HTMLCanvasElement | undefined;

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
      // Asanoha's slivers turn to confetti in flat colour.
      exclude: params.flat ? ['asanoha'] : [],
    });
    recipe.text = grille.recipe;
    regions = findRegions(grille, params.bar);
  };

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
    colours.lead = c.bars;
    colours.band = c.frame.front;
    colours.punctum = c.circles;
    // Two flat fills and the bare ground, so the panels read as fields of
    // colour rather than a striped quilt.
    colours.fills = [c.growth, c.walks, c.bg];
    fillImage = paintRegions(regions, colours.fills);
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
  onInput(g.addBinding(params, 'showBars', { label: 'show bars' }), () => props.render());
  onInput(g.addBinding(params, 'flat', { label: 'flat fills' }), () => {
    build();
    paint();
    props.render();
  });
  onInput(g.addBinding(params, 'bar', { min: 0.1, max: 3, step: 0.05 }), () => {
    build();
    paint();
    props.render();
  });
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
  onInput(colour.addBinding(params, 'fill', { min: 1.2, max: 8, step: 0.1, label: 'fill (:1)' }), repaint);
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

    if (params.flat && fillImage) {
      context.drawImage(fillImage, 0, 0, W * scale, H * scale);
    }

    context.strokeStyle = colours.lead;
    context.lineWidth = params.bar * scale;
    context.lineJoin = 'round';
    context.lineCap = 'round';
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
      // A flat band, filling everything between the opening and the edge.
      const band = new Path2D();
      band.rect(0, 0, width, height);
      band.rect(ox, oy, W * scale, H * scale);
      context.fillStyle = colours.band;
      context.fill(band, 'evenodd');
    }
  };
};

/** World units per region cell: fine enough that edges stay clean with the bars hidden. */
const RES = 0.06;

interface Regions {
  cols: number;
  rows: number;
  /** Region per cell, -1 under a bar. */
  ids: Int32Array;
  /** Fill index per region, neighbours differing where they can. */
  colour: number[];
}

/**
 * The panels the leading encloses: draw the bars (a little thinner than
 * drawn, so fills run under them) into a grid, label its open 4-connected
 * runs, and colour them so regions across a bar differ wherever they can —
 * the same rule the textures follow in khidki-grammar, over three colours.
 */
function findRegions(g: Grille, bar: number): Regions {
  const cols = Math.ceil(W / RES);
  const rows = Math.ceil(H / RES);
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(1 / RES, 1 / RES);
  ctx.lineWidth = bar * 0.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const pl of g.bars) pl.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
  for (const d of g.discs) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  const alpha = ctx.getImageData(0, 0, cols, rows).data;

  const ids = new Int32Array(cols * rows).fill(-1);
  let count = 0;
  for (let start = 0; start < ids.length; start++) {
    if (ids[start] >= 0 || alpha[start * 4 + 3] > 96) continue;
    ids[start] = count;
    const queue = [start];
    for (let k = 0; k < queue.length; k++) {
      const c = queue[k];
      const x = c % cols;
      for (const n of [x + 1 < cols ? c + 1 : -1, x > 0 ? c - 1 : -1, c + cols, c - cols]) {
        if (n < 0 || n >= ids.length || ids[n] >= 0 || alpha[n * 4 + 3] > 96) continue;
        ids[n] = count;
        queue.push(n);
      }
    }
    count++;
  }

  // Regions facing each other across a bar: look past closed cells along
  // the axes from every edge cell.
  const reach = Math.ceil(bar / RES) + 3;
  const adj: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  for (let c = 0; c < ids.length; c++) {
    const a = ids[c];
    if (a < 0) continue;
    const x = c % cols;
    const y = Math.floor(c / cols);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      if (x + dx >= cols || y + dy >= rows || ids[(y + dy) * cols + x + dx] >= 0) continue;
      for (let t = 2; t <= reach; t++) {
        const nx = x + dx * t;
        const ny = y + dy * t;
        if (nx >= cols || ny >= rows) break;
        const b = ids[ny * cols + nx];
        if (b < 0) continue;
        if (b !== a) {
          adj[a].add(b);
          adj[b].add(a);
        }
        break;
      }
    }
  }
  // Greedy colouring over three colours, breadth first, the least-used
  // free colour first; clashes only where three can't separate them.
  const colour = new Array<number>(count).fill(-1);
  const used = [0, 0, 0];
  for (let s = 0; s < count; s++) {
    if (colour[s] >= 0) continue;
    const queue = [s];
    for (let k = 0; k < queue.length; k++) {
      const r = queue[k];
      if (colour[r] >= 0) continue;
      const taken = new Set([...adj[r]].map((n) => colour[n]));
      const free = [0, 1, 2].filter((i) => !taken.has(i));
      const pool = free.length ? free : [0, 1, 2];
      const pick = pool.reduce((best, i) => (used[i] < used[best] || (used[i] === used[best] && Random.chance(0.5)) ? i : best));
      colour[r] = pick;
      used[pick]++;
      for (const n of adj[r]) if (colour[n] < 0) queue.push(n);
    }
  }
  return { cols, rows, ids, colour };
}

/** The regions painted in `fills`, as an image one pixel per region cell. */
function paintRegions(r: Regions, fills: string[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = r.cols;
  canvas.height = r.rows;
  const ctx = canvas.getContext('2d')!;
  // Resolve each fill to RGB through the canvas itself.
  const rgb = fills.map((f) => {
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data.slice(0, 3);
  });
  // Cells under a bar take the nearest region's colour (a breadth-first
  // spread from every region at once), so the panels meet edge to edge
  // under the leading, and cleanly when it is hidden.
  const near = Int32Array.from(r.ids);
  const queue: number[] = [];
  for (let c = 0; c < near.length; c++) if (near[c] >= 0) queue.push(c);
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const x = c % r.cols;
    for (const n of [x + 1 < r.cols ? c + 1 : -1, x > 0 ? c - 1 : -1, c + r.cols, c - r.cols]) {
      if (n < 0 || n >= near.length || near[n] >= 0) continue;
      near[n] = near[c];
      queue.push(n);
    }
  }
  const img = ctx.createImageData(r.cols, r.rows);
  for (let c = 0; c < near.length; c++) {
    const k = near[c] >= 0 ? rgb[r.colour[near[c]]] : rgb[2];
    img.data.set([k[0], k[1], k[2], 255], c * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1350],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
