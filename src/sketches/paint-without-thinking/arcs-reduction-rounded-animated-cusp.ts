import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { logColors } from '../../colors';
import {
  cuspPalette,
  describe,
  TIERS,
  type CuspPalette,
  type Gamut,
  type Ground,
  type Tier,
} from '../../colors/cusphanger';

/**
 * arcs-reduction-rounded-animated-cusp — fork of
 * arcs-reduction-rounded-animated, colored by cusphanger.
 *
 * The geometry is unchanged: a grid filled with wandering areas of arc cells,
 * reduced against its own edges, corner-rounded, then slid one shape into the
 * next. What changes is where the two colours come from. The hand-written
 * bg/ink pairs are gone; the ground is now cusphanger's tinted paper (or
 * slate) and the ink is a foreground swatch picked off the same palette by
 * WCAG contrast tier. Because each snapshot already carries its own
 * `inkColor`, an ink mode other than `single` hands every slide a fresh
 * colour on the one unchanging ground. Rendered in Display P3.
 */

console.clear();

// Which foreground the successive shapes take: one fixed swatch, a walk
// across the harmony's hues at one tier, a walk down the tiers of the base
// hue, or every foreground in turn.
type InkMode = 'single' | 'hues' | 'tiers' | 'all';
const INK_MODES: InkMode[] = ['single', 'hues', 'tiers', 'all'];

const config = {
  // res: [5, 3] as [number, number],
  res: [4, 4] as [number, number],
  debug: 0, // 0 = none, 1 = area cells, 2 = outline cells, 3 = all cells
  edgeAwareReduction: true,
  margin: 20,
  r: 10,
  shapeCount: 8, // number of distinct shapes (first and last are the same)
  transitionDuration: 0.1, // fraction of each segment spent animating (0–1)
  // color — cusphanger
  /** Degrees between neighbouring hues on cusphanger's ring. */
  angle: 48,
  /** Hues taken off the ring. */
  hueCount: 3,
  ground: 'random' as Ground | 'random',
  gamut: 'p3' as Gamut,
  saturation: 0.6,
  coolWarm: 0,
  inkTier: 'high' as Tier,
  inkMode: 'single' as InkMode,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

const shapeFolder = pane.addFolder({ title: 'Shape' });
shapeFolder.addBinding(config, 'shapeCount', {
  min: 2,
  max: 20,
  step: 1,
  label: 'Shape count',
});
shapeFolder.addBinding(config, 'transitionDuration', {
  min: 0.05,
  max: 0.5,
  step: 0.05,
  label: 'Transition (frac)',
});
shapeFolder.addBinding(config, 'margin', { min: 0, max: 80, step: 1 });
shapeFolder.addBinding(config, 'r', {
  min: 0,
  max: 60,
  step: 1,
  label: 'Corner r',
});
shapeFolder.addBinding(config, 'debug', { min: 0, max: 3, step: 1 });
shapeFolder.addBinding(config, 'edgeAwareReduction');

const colorFolder = pane.addFolder({ title: 'Color' });
colorFolder.addBinding(config, 'angle', { min: 10, max: 180, step: 1 });
colorFolder.addBinding(config, 'hueCount', { min: 1, max: 6, step: 1 });
colorFolder.addBinding(config, 'ground', {
  options: { random: 'random', light: 'light', dark: 'dark' },
});
colorFolder.addBinding(config, 'gamut', {
  options: { p3: 'p3', srgb: 'srgb' },
});
colorFolder.addBinding(config, 'saturation', { min: 0, max: 1, step: 0.05 });
colorFolder.addBinding(config, 'coolWarm', { min: -1, max: 1, step: 0.05 });
colorFolder.addBinding(config, 'inkTier', {
  options: TIERS.reduce(
    (o, t) => ((o[t] = t), o),
    {} as Record<string, string>,
  ),
  label: 'Ink tier',
});
colorFolder.addBinding(config, 'inkMode', {
  options: INK_MODES.reduce(
    (o, m) => ((o[m] = m), o),
    {} as Record<string, string>,
  ),
  label: 'Ink mode',
});

const regenBtn = pane.addButton({ title: 'Regenerate' });

// Single color engine: cusphanger — a tinted ground plus contrast-tiered
// foregrounds on hues shuffled off a ring, clamped to the chosen gamut shell.
function generatePalette(): CuspPalette {
  return cuspPalette({
    angle: config.angle,
    count: config.hueCount,
    ground: config.ground === 'random' ? undefined : config.ground,
    gamut: config.gamut,
    saturation: config.saturation,
    coolWarm: config.coolWarm,
  });
}

// The ink for shape `i`. Every mode but `single` keeps the ground fixed and
// moves the ink, so a slide can also be a colour change.
function inkFor(p: CuspPalette, i: number): string {
  const tier = p.tiers[config.inkTier];
  switch (config.inkMode) {
    case 'hues':
      return tier[i % tier.length].css;
    case 'tiers':
      return p.tiers[TIERS[i % TIERS.length]][0].css;
    case 'all':
      return p.fg[i % p.fg.length].css;
    default:
      return tier[0].css;
  }
}

function xyToIndex(x: number, y: number) {
  if (x < 0 || x >= config.res[0] || y < 0 || y >= config.res[1]) {
    return -1;
  }
  return y * config.res[0] + x;
}

type Corners = [boolean, boolean, boolean, boolean]; // TL, TR, BR, BL

// 0-----1
// |     |
// 3-----2
// Each entry appends the cell outline as a subpath — the caller owns
// beginPath()/fill(), so multiple cells can merge into a single fill and
// abutting cells never show an antialiased seam.
const cells = {
  blank: () => {},
  '0123': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    corners: Corners,
  ) => {
    context.roundRect(
      x,
      y,
      w,
      h,
      corners.map((c) => (c ? config.r : 0)),
    );
  },
  '013-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.arcTo(x + w, y + h, x, y + h, w);
    context.closePath();
  },
  '012-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.lineTo(x + w, y + h);
    context.arcTo(x, y + h, x, y, w);
    context.closePath();
  },
  '023-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.moveTo(x, y);
    context.arcTo(x + w, y, x + w, y + h, w);
    context.lineTo(x, y + h);
    context.closePath();
  },
  '123-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.moveTo(x + w, y);
    context.lineTo(x + w, y + h);
    context.lineTo(x, y + h);
    context.arcTo(x, y, x + w, y, w);
    context.closePath();
  },
} as const;
type CellType = keyof typeof cells;
const cellTypes = Object.keys(cells) as CellType[];

// Define mirrors for each cell type and edge
// mirrors[cellType][edgeIndex] = cellType that is a mirror across that edge
// [top, right, bottom, left]
const mirrors: Record<CellType, (CellType | null)[][]> = {
  blank: [
    ['0123', '023-arc', '123-arc'],
    ['0123', '013-arc', '023-arc'],
    ['0123', '012-arc', '013-arc'],
    ['0123', '012-arc', '123-arc'],
  ],
  '0123': [
    ['0123', '023-arc', '123-arc'],
    ['0123', '013-arc', '023-arc'],
    ['0123', '012-arc', '013-arc'],
    ['0123', '012-arc', '123-arc'],
  ],
  '013-arc': [['023-arc', '0123'], [null], [null], ['012-arc', '0123']],
  '012-arc': [['123-arc', '0123'], ['013-arc', '0123'], [null], [null]],
  '023-arc': [[null], [null], ['013-arc', '0123'], ['123-arc', '0123']],
  '123-arc': [[null], ['023-arc', '0123'], ['012-arc', '0123'], [null]],
};

// Edges are defined as [top, right, bottom, left]
type Edge = { '0-1': boolean; '10': boolean; '01': boolean; '-10': boolean };
const edges: Record<CellType, Edge> = {
  blank: { '0-1': false, '10': false, '01': false, '-10': false },
  '0123': { '0-1': true, '10': true, '01': true, '-10': true },
  '013-arc': { '0-1': true, '10': false, '01': false, '-10': true },
  '012-arc': { '0-1': true, '10': true, '01': false, '-10': false },
  '023-arc': { '0-1': false, '10': false, '01': true, '-10': true },
  '123-arc': { '0-1': false, '10': true, '01': true, '-10': false },
};

interface GridCell {
  x: number;
  y: number;
  occupied: boolean;
  color?: string;
  type: CellType;
  areaId?: number;
  corners: Corners;
}

interface GridSnapshot {
  grid: GridCell[];
  bg: string;
  inkColor: string;
}

function makeEmptyGrid(): GridCell[] {
  const result: GridCell[] = [];
  for (let y = 0; y < config.res[1]; y++) {
    for (let x = 0; x < config.res[0]; x++) {
      result.push({
        x,
        y,
        occupied: false,
        type: '0123',
        corners: [false, false, false, false],
      });
    }
  }
  return result;
}

function createArea(grid: GridCell[], inkColor: string, areaId: number) {
  let currentCell: GridCell = Random.pick(grid.filter((c) => !c.occupied));
  currentCell.occupied = true;
  currentCell.color = inkColor;
  currentCell.areaId = areaId;
  let count = 1;

  while (true) {
    const options = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ].filter(([dx, dy]) => {
      const nx = currentCell.x + dx;
      const ny = currentCell.y + dy;
      return (
        nx >= 0 &&
        nx < config.res[0] &&
        ny >= 0 &&
        ny < config.res[1] &&
        !grid[xyToIndex(nx, ny)].occupied
      );
    });

    if (options.length === 0) break;
    if (count > 10) break;

    const [dx, dy] = Random.pick(options);
    const nx = currentCell.x + dx;
    const ny = currentCell.y + dy;
    const next = grid[xyToIndex(nx, ny)];
    next.occupied = true;
    next.color = inkColor;
    next.areaId = areaId;

    const nextTypeOptions = cellTypes.filter((type) => {
      const currentType = currentCell.type;
      if (dx === 1 && dy === 0) {
        return mirrors[currentType][1].indexOf(type) !== -1;
      }
      if (dx === -1 && dy === 0) {
        return mirrors[currentType][3].indexOf(type) !== -1;
      }
      if (dx === 0 && dy === 1) {
        return mirrors[currentType][2].indexOf(type) !== -1;
      }
      if (dx === 0 && dy === -1) {
        return mirrors[currentType][0].indexOf(type) !== -1;
      }
      return false;
    });

    if (nextTypeOptions.length === 0) break;

    const nextType = Random.pick(nextTypeOptions);
    next.type = nextType;
    currentCell = next;

    count++;
  }
}

function fillGridWithAreas(grid: GridCell[], inkColor: string) {
  let unoccupied = grid.filter((c) => !c.occupied).length;
  let attempts = 0;
  const maxAttempts = 100;

  while (unoccupied > 0 && attempts < maxAttempts) {
    createArea(grid, inkColor, attempts);
    unoccupied = grid.filter((c) => !c.occupied).length;
    attempts++;
  }

  console.log(`Filled grid with areas in ${attempts} attempts`);
}

function reduce(grid: GridCell[], bgColor: string) {
  grid.forEach((cell) => {
    const neighbors = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]
      .map(([dx, dy]) => {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (nx >= 0 && nx < config.res[0] && ny >= 0 && ny < config.res[1]) {
          const n = grid[xyToIndex(nx, ny)];
          const dir = `${dx * -1}${dy * -1}` as keyof Edge;
          const color = config.edgeAwareReduction
            ? edges[n.type][dir]
              ? n.color
              : bgColor
            : n.color;

          return { ...n, color };
        }
        return null;
      })
      .filter((n) => n !== null) as GridCell[];

    const sameColorNeighbors = neighbors.filter((n) => n.color === cell.color);

    if (sameColorNeighbors.length === 0) {
      const colorCounts: Record<string, number> = {};
      neighbors.forEach((n) => {
        if (n.color) {
          colorCounts[n.color] = (colorCounts[n.color] || 0) + 1;
        }
      });
      const sortedColors = Object.entries(colorCounts).sort(
        (a, b) => b[1] - a[1],
      );
      if (sortedColors.length > 0) {
        cell.color = sortedColors[0][0];
        if (cell.color === bgColor) {
          cell.type = 'blank';
        }
      }
    }
  });
}

function roundCorners(grid: GridCell[]) {
  const neighborOffsets = [
    [0, -1], // top
    [1, 0], // right
    [0, 1], // bottom
    [-1, 0], // left
  ];

  grid.forEach((cell) => {
    const [top, right, bottom, left] = neighborOffsets.map(([dx, dy]) => {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      return grid[xyToIndex(nx, ny)];
    });

    const isNeighbourOpen = (
      neighbour: GridCell | undefined,
      edge: keyof Edge,
    ) => !(neighbour && edges[neighbour.type][edge]);
    const isCellOpen = (cell: GridCell, edge: keyof Edge) =>
      !edges[cell.type][edge];

    const tl =
      (isNeighbourOpen(top, '01') && isNeighbourOpen(left, '10')) ||
      (isCellOpen(cell, '0-1') && isNeighbourOpen(left, '10')) ||
      (isCellOpen(cell, '-10') && isNeighbourOpen(top, '01'));
    const tr =
      (isNeighbourOpen(top, '01') && isNeighbourOpen(right, '-10')) ||
      (isCellOpen(cell, '0-1') && isNeighbourOpen(right, '-10')) ||
      (isCellOpen(cell, '10') && isNeighbourOpen(top, '01'));
    const br =
      (isNeighbourOpen(bottom, '0-1') && isNeighbourOpen(right, '-10')) ||
      (isCellOpen(cell, '01') && isNeighbourOpen(right, '-10')) ||
      (isCellOpen(cell, '10') && isNeighbourOpen(bottom, '0-1'));
    const bl =
      (isNeighbourOpen(bottom, '0-1') && isNeighbourOpen(left, '10')) ||
      (isCellOpen(cell, '01') && isNeighbourOpen(left, '10')) ||
      (isCellOpen(cell, '-10') && isNeighbourOpen(bottom, '0-1'));

    cell.corners = [tl, tr, br, bl];
  });
}

function generateSnapshot(bg: string, inkColor: string): GridSnapshot {
  const grid = makeEmptyGrid();
  fillGridWithAreas(grid, inkColor);
  reduce(grid, bg);
  roundCorners(grid);
  return { grid, bg, inkColor };
}

// Draw bg-colored notches at corners to create smooth rounded open ends.
function drawCornerNotches(
  context: CanvasRenderingContext2D,
  bgColor: string,
  x: number,
  y: number,
  w: number,
  h: number,
  corners: Corners,
) {
  const r = config.r;
  const [tl, tr, br, bl] = corners;
  context.fillStyle = bgColor;
  // TL
  if (tl) {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + r, y);
    context.arc(x + r, y + r, r, -Math.PI / 2, Math.PI, true);
    context.closePath();
    context.fill();
  }
  // TR
  if (tr) {
    context.beginPath();
    context.moveTo(x + w, y);
    context.lineTo(x + w, y + r);
    context.arc(x + w - r, y + r, r, 0, -Math.PI / 2, true);
    context.closePath();
    context.fill();
  }
  // BR
  if (br) {
    context.beginPath();
    context.moveTo(x + w, y + h);
    context.lineTo(x + w - r, y + h);
    context.arc(x + w - r, y + h - r, r, Math.PI / 2, 0, true);
    context.closePath();
    context.fill();
  }
  // BL
  if (bl) {
    context.beginPath();
    context.moveTo(x, y + h);
    context.lineTo(x + r, y + h);
    context.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    context.closePath();
    context.fill();
  }
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// Notches run as a second pass after every cell shape, so no later fill
// can land on top of a carved corner.
function drawCellNotches(
  ctx: CanvasRenderingContext2D,
  cell: GridCell,
  bgColor: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (cell.type === 'blank' || cell.type === '0123') return;
  drawCornerNotches(ctx, bgColor, x, y, w, h, cell.corners);
}

function drawCellDebugLabel(
  ctx: CanvasRenderingContext2D,
  cell: GridCell,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (config.debug !== 1 || cell.type === 'blank') return;
  ctx.fillStyle = `rgb(from ${cell.color} calc(255 - r) calc(255 - g) calc(255 - b))`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `32px monospace`;
  ctx.fillText(`${cell.type}`, x + w / 2, y + h / 2);
}

type SlideDirection = 'ltr' | 'rtl' | 'ttb' | 'btt';
const slideDirections: SlideDirection[] = ['ltr', 'rtl', 'ttb', 'btt'];

interface Built {
  sig: string;
  shapes: GridSnapshot[];
  directions: SlideDirection[];
}

export const sketch = async ({ wrap, context, ...props }: SketchProps) => {
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

  let seed = Random.getRandomSeed();
  let logged = '';
  let built: Built | null = null;

  regenBtn.on('click', () => {
    seed = Random.getRandomSeed();
  });

  // Deterministic rebuild keyed on seed + config, so pane edits are live and
  // the same seed always replays the same loop.
  const build = (): Built => {
    const sig = `${seed}:${JSON.stringify(config)}`;
    if (built && built.sig === sig) return built;

    Random.setSeed(seed);
    const palette = generatePalette();

    const logSig = `${seed}:${describe(palette)}`;
    if (logged !== logSig) {
      console.log('Seed:', seed);
      console.log('Palette:', describe(palette));
      logColors(palette.colors);
      logged = logSig;
    }

    // Precompute all shapes; first and last are the same for seamless looping
    const shapes: GridSnapshot[] = [];
    for (let i = 0; i < config.shapeCount; i++) {
      shapes.push(generateSnapshot(palette.bg.css, inkFor(palette, i)));
    }
    shapes.push(shapes[0]);

    // Precompute a random slide direction for each transition
    const directions: SlideDirection[] = [];
    for (let i = 0; i < shapes.length - 1; i++) {
      directions.push(Random.pick(slideDirections));
    }

    built = { sig, shapes, directions };
    return built;
  };

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const { shapes, directions } = build();
    const cycles = shapes.length - 1;
    const shapeIndex = Math.floor(playhead * cycles);
    const t = (playhead * cycles) % 1;

    const currentSnapshot = shapes[Math.min(shapeIndex, cycles - 1)];
    const nextSnapshot = shapes[Math.min(shapeIndex + 1, cycles)];
    const bgColor = currentSnapshot.bg;

    context.fillStyle = bgColor;
    context.fillRect(0, 0, width, height);

    const w = (width - config.margin * 2) / config.res[0];
    const h = (height - config.margin * 2) / config.res[1];

    context.save();
    context.translate(config.margin, config.margin);

    // Transition happens in the last fraction of each segment
    const holdEnd = 1 - config.transitionDuration;
    const animT = t <= holdEnd ? 0 : (t - holdEnd) / config.transitionDuration;

    const dir = directions[Math.min(shapeIndex, directions.length - 1)];
    const size = dir === 'ltr' || dir === 'rtl' ? w : h;

    // Snap the transition endpoints to fully-resting grids once the slide
    // offset is sub-pixel, so edge frames never show per-cell seams.
    const pRaw = smoothstep(animT);
    const eps = 0.75 / size;
    const p = pRaw < eps ? 0 : pRaw > 1 - eps ? 1 : pRaw;

    const changes = (i: number) =>
      currentSnapshot.grid[i].type !== nextSnapshot.grid[i].type ||
      currentSnapshot.grid[i].color !== nextSnapshot.grid[i].color;
    const sliding = (i: number) => p > 0 && p < 1 && changes(i);
    // Once the slide completes (p === 1) the changed cells rest in their
    // next-snapshot state.
    const restingCell = (i: number) =>
      p === 1 && changes(i) ? nextSnapshot.grid[i] : currentSnapshot.grid[i];

    // Pass 1: every resting cell merges into ONE path and fill, so abutting
    // cells share interior coverage and no antialiased seam shows between
    // them.
    context.fillStyle = currentSnapshot.inkColor;
    context.beginPath();
    for (let i = 0; i < currentSnapshot.grid.length; i++) {
      const cell = restingCell(i);
      if (sliding(i) || cell.type === 'blank') continue;
      cells[cell.type](context, cell.x * w, cell.y * h, w, h, cell.corners);
    }
    context.fill();

    // Sliding cells all share one offset, so each group (outgoing and
    // incoming) also draws as a single union fill, clipped to the union of
    // the sliding cell rects.
    const drawSlidingGroup = (snapshot: GridSnapshot, offset: number) => {
      const dx = dir === 'ltr' ? offset : dir === 'rtl' ? -offset : 0;
      const dy = dir === 'ttb' ? offset : dir === 'btt' ? -offset : 0;
      context.save();
      context.beginPath();
      for (let i = 0; i < snapshot.grid.length; i++) {
        if (!sliding(i)) continue;
        const cell = currentSnapshot.grid[i];
        context.rect(cell.x * w - 1, cell.y * h - 1, w + 2, h + 2);
      }
      context.clip();
      context.translate(dx, dy);
      context.fillStyle = snapshot.inkColor;
      context.beginPath();
      for (let i = 0; i < snapshot.grid.length; i++) {
        const cell = snapshot.grid[i];
        if (!sliding(i) || cell.type === 'blank') continue;
        cells[cell.type](context, cell.x * w, cell.y * h, w, h, cell.corners);
      }
      context.fill();
      for (let i = 0; i < snapshot.grid.length; i++) {
        if (!sliding(i)) continue;
        const cell = snapshot.grid[i];
        drawCellNotches(context, cell, bgColor, cell.x * w, cell.y * h, w, h);
        drawCellDebugLabel(context, cell, cell.x * w, cell.y * h, w, h);
      }
      context.restore();
    };

    if (p > 0 && p < 1) {
      // Current slides out: 0 → +size; next slides in: -size → 0
      drawSlidingGroup(currentSnapshot, p * size);
      drawSlidingGroup(nextSnapshot, (p - 1) * size);
    }

    // Pass 2: notches over the resting fill, so nothing paints across a
    // carve.
    for (let i = 0; i < currentSnapshot.grid.length; i++) {
      if (sliding(i)) continue;
      const cell = restingCell(i);
      drawCellNotches(context, cell, bgColor, cell.x * w, cell.y * h, w, h);
      drawCellDebugLabel(context, cell, cell.x * w, cell.y * h, w, h);
    }

    if (config.debug === 2) {
      context.strokeStyle = bgColor;
      context.lineWidth = 1;
      currentSnapshot.grid.forEach((cell) => {
        context.strokeRect(cell.x * w, cell.y * h, w, h);
      });
    }

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [640, 840],
  dimensions: [1080, 1080],
  // dimensions: [1040, 640],
  attributes: { colorSpace: 'display-p3' },
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  framesFormat: ['mp4'],
  prefix: `arcs-reduction-cusp-`,
};

ssam(sketch as Sketch<'2d'>, settings);
