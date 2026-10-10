import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import Color from 'canvas-sketch-util/color';
import riso from 'riso-colors';
import { randomPalette } from '../../colors/riso';
import { logColors } from '../../colors';
import { setupPenplotExport } from '../../penplot/render-penplot';
import { getDimensionsFromPreset } from '../../penplot/distances';

/**
 * pen-stroke — albers-meander ported to the plotter. Two independent
 * Hamiltonian paths cover the same grid of nodes on an A4 sheet, each one
 * unbroken polyline: the one drawing a pen plotter makes without lifting.
 * Two pens, two layers: a broad pale marker draws the ghost meander, a fine
 * liner draws the ink meander over it. Cmd/Ctrl+S writes the layered SVG
 * (physical units, one <path> per pen) beside the PNG.
 */

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log('seed:', seed);

const units = 'cm';
const [physicalWidth, physicalHeight] = getDimensionsFromPreset('a4', units);

const config = {
  spacing: 1.2, // cm between neighbouring nodes
  margin: 2.4, // cm of bare sheet round the field
  ghostWidth: 0.42, // cm — broad marker
  inkWidth: 0.06, // cm — fine liner
  noise: 0.7, // Warnsdorff tie-break noise
  attempts: 4000,
};

/* --------------------------------- colour --------------------------------- */

const { bg: sheet, inkColors } = randomPalette(3);
const ink = Random.pick(inkColors);
// The ghost pen: a riso ink that barely separates from the sheet.
const ghost = Random.pick(
  riso
    .map((c) => c.hex)
    .filter((c) => c !== ink && Color.contrastRatio(sheet, c) >= 1.15)
    .sort((a, b) => Color.contrastRatio(sheet, a) - Color.contrastRatio(sheet, b))
    .slice(0, 5),
);
logColors([sheet, ghost, ink]);

/* ------------------------- one-line (Hamiltonian) ------------------------- */

type Cell = [number, number];

const STEPS: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * A Hamiltonian path over a cols × rows grid by Warnsdorff's rule: always
 * step to the free neighbour with the fewest free neighbours of its own,
 * with a little noise on that degree so near-ties break differently each run.
 * A dead end restarts from a fresh random node — the same rule nalee-one-line
 * uses, minus the walker machinery.
 */
function hamiltonianPath(cols: number, rows: number): Cell[] {
  const total = cols * rows;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < cols && y < rows;
  let best: Cell[] = [];

  for (let attempt = 0; attempt < config.attempts; attempt++) {
    const used = new Uint8Array(total);
    const free = (x: number, y: number) => inside(x, y) && !used[y * cols + x];
    const degree = (x: number, y: number) =>
      STEPS.reduce((n, [dx, dy]) => n + (free(x + dx, y + dy) ? 1 : 0), 0);

    let cur: Cell = [Random.rangeFloor(0, cols), Random.rangeFloor(0, rows)];
    const path: Cell[] = [cur];
    used[cur[1] * cols + cur[0]] = 1;

    while (path.length < total) {
      const options = STEPS.map(([dx, dy]): Cell => [cur[0] + dx, cur[1] + dy]).filter(([x, y]) =>
        free(x, y),
      );
      if (options.length === 0) break;
      const scored = options.map((c) => {
        used[c[1] * cols + c[0]] = 1;
        const d = degree(c[0], c[1]) + Random.range(-config.noise, config.noise);
        used[c[1] * cols + c[0]] = 0;
        return { c, d };
      });
      scored.sort((a, b) => a.d - b.d);
      cur = scored[0].c;
      used[cur[1] * cols + cur[0]] = 1;
      path.push(cur);
    }

    if (path.length === total) return path;
    if (path.length > best.length) best = path;
  }
  console.warn(`no full cover after ${config.attempts} tries: ${best.length}/${total}`);
  return best;
}

/* ----------------------------------- svg ---------------------------------- */

interface Pen {
  name: string;
  color: string;
  width: number;
  pts: Cell[]; // physical units
}

const fmt = (n: number) => +n.toFixed(4);
const toD = (pts: Cell[]) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join(' ');

/** Physically sized SVG, one Inkscape layer and one unbroken path per pen. */
function buildSvg(pens: Pen[]): string {
  const layers = pens
    .map(
      (p, i) =>
        `  <g inkscape:groupmode="layer" inkscape:label="${i + 1}-${p.name}" id="${p.name}">\n` +
        `    <path d="${toD(p.pts)}" fill="none" stroke="${p.color}" stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>\n` +
        `  </g>`,
    )
    .join('\n');
  return (
    `<?xml version="1.0" standalone="no"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
    `width="${physicalWidth}${units}" height="${physicalHeight}${units}" ` +
    `viewBox="0 0 ${physicalWidth} ${physicalHeight}">\n${layers}\n</svg>\n`
  );
}

/* --------------------------------- sketch --------------------------------- */

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  let latestSvg: string | null = null;
  const cleanupExport = setupPenplotExport(settings, () => latestSvg);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanupExport();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // The largest whole grid that fits inside the margin, centred on the sheet.
  const cols = Math.floor((physicalWidth - config.margin * 2) / config.spacing) + 1;
  const rows = Math.floor((physicalHeight - config.margin * 2) / config.spacing) + 1;
  const ox = (physicalWidth - (cols - 1) * config.spacing) / 2;
  const oy = (physicalHeight - (rows - 1) * config.spacing) / 2;
  const toSheet = ([x, y]: Cell): Cell => [ox + x * config.spacing, oy + y * config.spacing];

  const pens: Pen[] = [
    { name: 'ghost', color: ghost, width: config.ghostWidth, pts: hamiltonianPath(cols, rows).map(toSheet) },
    { name: 'ink', color: ink, width: config.inkWidth, pts: hamiltonianPath(cols, rows).map(toSheet) },
  ];
  latestSvg = buildSvg(pens);

  wrap.render = () => {
    context.fillStyle = sheet;
    context.fillRect(0, 0, width, height);

    // preview: draw in centimetres, exactly the strokes the SVG holds
    context.save();
    context.scale(width / physicalWidth, height / physicalHeight);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const pen of pens) {
      context.strokeStyle = pen.color;
      context.lineWidth = pen.width;
      context.beginPath();
      pen.pts.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
      context.stroke();
    }
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, Math.round(1080 * (physicalHeight / physicalWidth))],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
