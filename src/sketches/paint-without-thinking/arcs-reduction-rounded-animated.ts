import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { logColors } from '../../colors';

console.clear();
Random.setSeed(Random.getRandomSeed());
// Random.setSeed('564840');
// Random.setSeed('221329');
// Random.setSeed('75148');
// Random.setSeed('505894');
// Random.setSeed('33274');
// Random.setSeed('118456');
// Random.setSeed('933689');
// Random.setSeed('34985');
// Random.setSeed('987035');
// Random.setSeed('465094');
// Random.setSeed('328181');
// Random.setSeed('2514');
console.log(`Seed: ${Random.getSeed()}`);

const config = {
  // res: [5, 3] as [number, number],
  res: [4, 4] as [number, number],
  debug: 0, // 0 = none, 1 = area cells, 2 = outline cells, 3 = all cells
  edgeAwareReduction: true,
  margin: 20,
  r: 10,
  shapeCount: 8, // number of distinct shapes (first and last are the same)
  transitionDuration: 0.1, // fraction of each segment spent animating (0–1)
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

pane.addBinding(config, 'shapeCount', {
  min: 2,
  max: 20,
  step: 1,
  label: 'Shape count',
});
pane.addBinding(config, 'transitionDuration', {
  min: 0.05,
  max: 0.5,
  step: 0.05,
  label: 'Transition (frac)',
});
pane.addBinding(config, 'margin', { min: 0, max: 80, step: 1 });
pane.addBinding(config, 'r', { min: 0, max: 60, step: 1, label: 'Corner r' });
pane.addBinding(config, 'debug', { min: 0, max: 3, step: 1 });
pane.addBinding(config, 'edgeAwareReduction');

// Only palettes with exactly one ink color
const palettes = [
  { bg: '#fff', ink: ['#222'] },
  { bg: '#fff', ink: ['#f13401'] },
  { bg: '#fff', ink: ['#0769ce'] },
  { bg: '#fff', ink: ['#f1d93c'] },
  { bg: '#fff', ink: ['#11804b'] },
  { bg: '#FDFCF3', ink: ['#002500'] },
  { bg: '#FDFCF3', ink: ['#2A42FF'] },
  { bg: '#FDFCF3', ink: ['#AB2A00'] },
  { bg: '#FDFCF3', ink: ['#EB562F'] },
  { bg: '#EB562F', ink: ['#2B0404'] },
  { bg: '#FDFCF3', ink: ['#AB2A00'] },
  { bg: '#CEFF00', ink: ['#2B0404'] },
  { bg: '#CEFF00', ink: ['#002500'] },
  { bg: '#ECE5F0', ink: ['#002500'] },
  { bg: '#ECE5F0', ink: ['#2A42FF'] },
  { bg: '#FFFFFF', ink: ['#000000'] },
  { bg: '#FBF9F3', ink: ['#000000'] },
  { bg: '#FFFFFF', ink: ['#FFA500'] },
  { bg: '#FFFFFF', ink: ['#8F0202'] },
  { bg: '#FFFFFF', ink: ['#042411'] },
  { bg: '#FBF9F3', ink: ['#042411'] },
  { bg: '#E5D5FF', ink: ['#042411'] },
  { bg: '#FFFFFF', ink: ['#E5D5FF'] },
  { bg: '#FFFFFF', ink: ['#FFDDDD'] },
  { bg: '#FFFFFF', ink: ['#A8F0E6'] },
  { bg: '#FFDDDD', ink: ['#8F0202'] },
  { bg: '#E5D5FF', ink: ['#8F0202'] },
];

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
    context.beginPath();
    context.roundRect(
      x,
      y,
      w,
      h,
      corners.map((c) => (c ? config.r : 0)),
    );
    context.fill();
  },
  '013-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.arcTo(x + w, y + h, x, y + h, w);
    context.closePath();
    context.fill();
  },
  '012-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.lineTo(x + w, y + h);
    context.arcTo(x, y + h, x, y, w);
    context.fill();
  },
  '023-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.beginPath();
    context.moveTo(x, y);
    context.arcTo(x + w, y, x + w, y + h, w);
    context.lineTo(x, y + h);
    context.closePath();
    context.fill();
  },
  '123-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    _corners: Corners,
  ) => {
    context.beginPath();
    context.moveTo(x + w, y);
    context.lineTo(x + w, y + h);
    context.lineTo(x, y + h);
    context.arcTo(x, y, x + w, y, w);
    context.fill();
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

function generateSnapshot(
  palette: { bg: string; ink: string[] } = Random.pick(palettes),
): GridSnapshot {
  const inkColor = palette.ink[0];
  logColors([inkColor]);
  const grid = makeEmptyGrid();
  fillGridWithAreas(grid, inkColor);
  reduce(grid, palette.bg);
  roundCorners(grid);
  return { grid, bg: palette.bg, inkColor };
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

function drawCellFull(
  ctx: CanvasRenderingContext2D,
  cell: GridCell,
  bgColor: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (cell.type === 'blank') return;
  ctx.fillStyle = cell.color!;
  cells[cell.type](ctx, x, y, w, h, cell.corners);
  if (cell.type !== '0123') {
    drawCornerNotches(ctx, bgColor, x, y, w, h, cell.corners);
  }
  if (config.debug === 1) {
    ctx.fillStyle = `rgb(from ${cell.color} calc(255 - r) calc(255 - g) calc(255 - b))`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `32px monospace`;
    ctx.fillText(`${cell.type}`, x + w / 2, y + h / 2);
  }
}

type SlideDirection = 'ltr' | 'rtl' | 'ttb' | 'btt';
const slideDirections: SlideDirection[] = ['ltr', 'rtl', 'ttb', 'btt'];

// Draws cell translated by offset along the slide direction, clipped to the cell rect
function drawCellSlid(
  ctx: CanvasRenderingContext2D,
  cell: GridCell,
  bgColor: string,
  x: number,
  y: number,
  w: number,
  h: number,
  offset: number,
  direction: SlideDirection,
) {
  if (cell.type === 'blank') return;
  const dx = direction === 'ltr' ? offset : direction === 'rtl' ? -offset : 0;
  const dy = direction === 'ttb' ? offset : direction === 'btt' ? -offset : 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 1, y - 1, w + 2, h + 2);
  ctx.clip();
  drawCellFull(ctx, cell, bgColor, x + dx, y + dy, w, h);
  ctx.restore();
}

export const sketch = async ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    console.log('Export triggered from custom server endpoint');
    props.exportFrame();
  });

  // Precompute all shapes; first and last are the same for seamless looping
  const palette = Random.pick(palettes);
  const shapes: GridSnapshot[] = [];
  for (let i = 0; i < config.shapeCount; i++) {
    shapes.push(generateSnapshot(palette));
  }
  shapes.push(shapes[0]);

  // Precompute a random slide direction for each transition
  const directions: SlideDirection[] = [];
  for (let i = 0; i < shapes.length - 1; i++) {
    directions.push(Random.pick(slideDirections));
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
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

    for (let i = 0; i < currentSnapshot.grid.length; i++) {
      const fromCell = currentSnapshot.grid[i];
      const toCell = nextSnapshot.grid[i];
      const x = fromCell.x * w;
      const y = fromCell.y * h;

      const changing =
        fromCell.type !== toCell.type || fromCell.color !== toCell.color;

      if (!changing || animT === 0) {
        drawCellFull(context, fromCell, bgColor, x, y, w, h);
      } else {
        const dir = directions[Math.min(shapeIndex, directions.length - 1)];
        const size = dir === 'ltr' || dir === 'rtl' ? w : h;
        const p = smoothstep(animT);
        // Current slides out: 0 → +size
        drawCellSlid(context, fromCell, bgColor, x, y, w, h, p * size, dir);
        // Next slides in: -size → 0
        drawCellSlid(context, toCell, bgColor, x, y, w, h, (p - 1) * size, dir);
      }
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
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  framesFormat: ['mp4'],
  prefix: `arcs-reduction-`,
};

ssam(sketch as Sketch<'2d'>, settings);
