import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapMaker } from './algorithm';
import type { Street } from './algorithm';
import { cuspPalette } from '../../colors/cusphanger';

// map/basic's street network, grown to rest, closed into blocks and coloured
// with recursive-network's rule. The streets are rasterised onto a coarse
// cell grid; every connected run of non-street cells is a block. Two blocks
// are neighbours only where a street runs between them (probes go straight
// across each street cell, so blocks meeting diagonally at a crossing are
// not). Blocks then take cusphanger hue families by an exact DSatur map
// colouring: washes first, a family's accent only where the washes run out.

const config = {
  cell: 2,
  street: 7,
  frame: 28,
  hueCount: 3,
  angle: 48,
  minBlock: 24,
};

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const palette = cuspPalette({ angle: config.angle, count: config.hueCount });
  const bg = palette.bg.css;
  const hues = palette.hues.length;
  // Colour index c < hues is family c's wash; c ≥ hues is family (c − hues)'s accent.
  const fills = [...palette.tiers.low.map((s) => s.css), ...palette.tiers.mid.map((s) => s.css)];

  // --- grow the streets to rest ------------------------------------------------
  const grow = mapMaker([width, height]);
  let streets: Street[] = [];
  let restingFor = 0;
  for (let i = 0; i < 6000 && restingFor < 3; i++) {
    streets = grow();
    const resting = streets.every(
      (s) => s.forwardState === 'stopped' && s.backwardState === 'stopped',
    );
    restingFor = resting ? restingFor + 1 : 0;
  }

  const streetPath = new Path2D();
  for (const s of streets) {
    s.points.forEach(([x, y], i) => (i === 0 ? streetPath.moveTo(x, y) : streetPath.lineTo(x, y)));
  }

  // --- close them into blocks --------------------------------------------------
  const cols = Math.ceil(width / config.cell);
  const rows = Math.ceil(height / config.cell);
  const raster = document.createElement('canvas');
  raster.width = cols;
  raster.height = rows;
  const rctx = raster.getContext('2d', { willReadFrequently: true })!;
  rctx.scale(1 / config.cell, 1 / config.cell);
  rctx.strokeStyle = '#000';
  rctx.lineWidth = config.street * 0.7;
  rctx.lineCap = 'square';
  rctx.stroke(streetPath);
  rctx.lineWidth = config.frame * 2 * 0.9;
  rctx.strokeRect(0, 0, width, height);
  const ink = rctx.getImageData(0, 0, cols, rows).data;

  // label: −1 street, otherwise block id (connected 4-neighbour runs).
  const label = new Int32Array(cols * rows).fill(-2);
  for (let i = 0; i < label.length; i++) if (ink[i * 4 + 3] > 40) label[i] = -1;
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < label.length; start++) {
    if (label[start] !== -2) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % cols;
      const nbrs = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, i - cols, i + cols];
      for (const j of nbrs) {
        if (j < 0 || j >= label.length || label[j] !== -2) continue;
        label[j] = id;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  // Slivers between near-parallel streets are swallowed back into the street.
  for (let i = 0; i < label.length; i++) if (label[i] >= 0 && sizes[label[i]] < config.minBlock) label[i] = -1;

  // --- which blocks face each other across a street ------------------------------
  const blocks = sizes.length;
  const links = Array.from({ length: blocks }, () => new Set<number>());
  const reach = Math.ceil((config.street * 0.7) / config.cell) + 2;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= cols || y >= rows ? -1 : label[y * cols + x];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (label[y * cols + x] !== -1) continue;
      for (const [a, b] of [
        [at(x - reach, y), at(x + reach, y)],
        [at(x, y - reach), at(x, y + reach)],
      ]) {
        if (a >= 0 && b >= 0 && a !== b) {
          links[a].add(b);
          links[b].add(a);
        }
      }
    }
  }

  const colour = colourAreas(links, hues * 2, hues);

  // --- paint: one tinted mask per colour, streets redrawn crisp on top ----------
  const layer = document.createElement('canvas');
  layer.width = cols;
  layer.height = rows;
  const lctx = layer.getContext('2d', { colorSpace: 'display-p3' })!;
  const image = lctx.createImageData(cols, rows);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;

    for (let c = 0; c < fills.length; c++) {
      const d = image.data;
      for (let i = 0; i < label.length; i++) {
        const on = label[i] >= 0 && colour[label[i]] === c;
        d[i * 4 + 3] = on ? 255 : 0;
      }
      lctx.globalCompositeOperation = 'copy';
      lctx.putImageData(image, 0, 0);
      lctx.globalCompositeOperation = 'source-in';
      lctx.fillStyle = fills[c];
      lctx.fillRect(0, 0, cols, rows);
      context.drawImage(layer, 0, 0, cols * config.cell, rows * config.cell);
    }

    // Streets in the ground colour, wider than the raster so the mask's
    // stepped edges sit under them.
    context.strokeStyle = bg;
    context.lineCap = 'square';
    context.lineWidth = config.street;
    context.stroke(streetPath);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, config.frame);
    context.fillRect(0, height - config.frame, width, config.frame);
    context.fillRect(0, 0, config.frame, height);
    context.fillRect(width - config.frame, 0, config.frame, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);

/**
 * recursive-network's map colouring: every area takes one of `count` colours
 * so no two neighbours share one. Exact search in DSatur order (most distinct
 * colours around it first, ties to most neighbours), the first `preferred`
 * colours tried before the rest, each group in seeded random order, backing
 * up on dead ends within `budget` steps; failing that, greedy DSatur taking
 * the least-clashing colour.
 */
function colourAreas(links: Set<number>[], count: number, preferred = count, budget = 20000): number[] {
  const n = links.length;
  const colour = new Array<number>(n).fill(-1);

  const nextArea = () => {
    let next = -1;
    let bestSat = -1;
    let bestDeg = -1;
    for (let i = 0; i < n; i++) {
      if (colour[i] >= 0) continue;
      const sat = new Set([...links[i]].map((j) => colour[j]).filter((c) => c >= 0)).size;
      if (sat > bestSat || (sat === bestSat && links[i].size > bestDeg)) {
        next = i;
        bestSat = sat;
        bestDeg = links[i].size;
      }
    }
    return next;
  };
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

  let steps = 0;
  const search = (left: number): boolean => {
    if (left === 0) return true;
    if (++steps > budget) return false;
    const area = nextArea();
    const taken = new Set([...links[area]].map((j) => colour[j]));
    const order = [
      ...(Random.shuffle(range(0, preferred)) as number[]),
      ...(Random.shuffle(range(preferred, count)) as number[]),
    ];
    for (const c of order) {
      if (taken.has(c)) continue;
      colour[area] = c;
      if (search(left - 1)) return true;
      colour[area] = -1;
      if (steps > budget) return false;
    }
    return false;
  };
  if (search(n)) return colour;

  colour.fill(-1);
  for (let step = 0; step < n; step++) {
    const area = nextArea();
    const clashes = Array.from({ length: count }, (_, c) =>
      [...links[area]].filter((j) => colour[j] === c).length,
    );
    const least = Math.min(...clashes);
    const best = clashes.flatMap((k, c) => (k === least ? [c] : []));
    const early = best.filter((c) => c < preferred);
    colour[area] = Random.pick(early.length > 0 ? early : best);
  }
  return colour;
}
