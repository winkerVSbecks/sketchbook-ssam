import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { clrs } from '../../../colors/clrs';
import { logColors } from '../../../colors';
import { createGlyphBuffer, createMetrics, contrastRatio } from '../../../tui';
import { createNaleeSystem } from '../nalee-system';
import { makeDomain } from '../domain';
import { walkerToPaths } from '../walker';
import type { Config } from '../types';
import { xyToCoords } from '../utils';

/**
 * box-drawing — nalee/sketches/basic's walkers run as text. The same pipe
 * system fills a grid of character cells; each walker's walk is spelled in
 * double-line box glyphs (═ ║ ╔ ╗ ╚ ╝) in one colour per walker, so every
 * straight move is a rule and every turn a corner. A short run of ink travels
 * the length of each pipe once per loop.
 */

Random.setSeed(Random.getRandomSeed());

const FONT_SIZE = 18;
// Menlo's box glyphs span ≈1.17 em; a line pitch to match lets ║ join up.
const LINE_H = Math.round(FONT_SIZE * 1.17);
const MARGIN = 2; // cells of ground round the pipe field
const RUN = 4; // cells of travelling ink per pipe

// Neighbour bits: which sides of a cell the pipe leaves through.
const N = 1;
const E = 2;
const S = 4;
const W = 8;

const GLYPHS: Record<number, string> = {
  [E | W]: '═',
  [N | S]: '║',
  [E | S]: '╔',
  [W | S]: '╗',
  [N | E]: '╚',
  [N | W]: '╝',
  [E]: '╞',
  [W]: '╡',
  [N]: '╨',
  [S]: '╥',
  0: '▫',
};

interface PipeCell {
  row: number;
  col: number;
  ch: string;
}

interface Pipe {
  cells: PipeCell[];
  color: string;
  phase: number;
}

const sideTo = (dx: number, dy: number): number =>
  dx === 1 ? E : dx === -1 ? W : dy === 1 ? S : dy === -1 ? N : 0;

/** One walker path in grid coords → its box-drawing glyphs, cell by cell. */
function spell(pts: Line, color: string): Pipe {
  const cells = pts.map(([x, y], i) => {
    let mask = 0;
    const prev = pts[i - 1];
    const next = pts[i + 1];
    if (prev) mask |= sideTo(prev[0] - x, prev[1] - y);
    if (next) mask |= sideTo(next[0] - x, next[1] - y);
    return { row: y + MARGIN, col: x + MARGIN, ch: GLYPHS[mask] ?? '·' };
  });
  return { cells, color, phase: Random.value() };
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const metrics = createMetrics(context, { fontSize: FONT_SIZE, lineH: LINE_H });
  const cols = metrics.cols(width);
  const rows = metrics.rows(height);
  const buf = createGlyphBuffer(rows, cols);
  // Centre the character grid on the canvas.
  const ox = (width - cols * metrics.charW) / 2;
  const oy = (height - rows * metrics.lineH) / 2;

  const palette = Random.pick(clrs) as string[];
  const [bg, ...fg] = palette;
  const inks = fg.filter((c) => contrastRatio(c, bg) >= 1.6);
  const walkerColors = inks.length ? inks : fg;
  const ink = walkerColors.reduce((a, c) => (contrastRatio(c, bg) > contrastRatio(a, bg) ? c : a));
  logColors(palette);

  // The domain is inclusive (resolution + 1 nodes per side): one node per cell.
  const resolution = [cols - 1 - MARGIN * 2, rows - 1 - MARGIN * 2];
  const config = {
    resolution,
    size: 1,
    stepSize: 1,
    walkerCount: 30,
    padding: 0,
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(resolution, 0, width, height);
  const domain = makeDomain(resolution, domainToWorld);
  const system = createNaleeSystem(domain, config, domainToWorld, walkerColors, bg);

  const pipes: Pipe[] = system.walkers.flatMap((w) =>
    walkerToPaths(w).map((pts) => spell(pts, w.color)),
  );

  wrap.render = ({ playhead }: SketchProps) => {
    buf.clear();
    for (const p of pipes) {
      const n = p.cells.length;
      // the run's head walks the whole pipe once per loop
      const head = Math.floor(((playhead + p.phase) % 1) * n);
      p.cells.forEach((c, i) => {
        const behind = (head - i + n) % n;
        buf.put(c.row, c.col, c.ch, n > RUN && behind < RUN ? ink : p.color);
      });
    }

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.save();
    context.translate(ox, oy);
    buf.blit(context, metrics);
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
