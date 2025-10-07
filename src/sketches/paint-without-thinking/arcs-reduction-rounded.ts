import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
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
console.log(`Seed: ${Random.getSeed()}`);

const config = {
  // res: [3, 4],
  // res: [3, 3],
  res: [4, 3],
  debug: 0, // 0 = none, 1 = area cells, 2 = outline cells, 3 = all cells
  edgeAwareReduction: true,
  margin: 20,
};

const palettes = [
  { bg: '#fff', ink: ['#222'] },
  { bg: '#fff', ink: ['#f13401'] },
  { bg: '#fff', ink: ['#0769ce'] },
  { bg: '#fff', ink: ['#f1d93c'] },
  { bg: '#fff', ink: ['#11804b'] },
  { bg: '#fff', ink: ['#f13401', '#222'] },
  { bg: '#fff', ink: ['#0769ce', '#f1d93c'] },
  { bg: '#fff', ink: ['#f13401', '#0769ce', '#f1d93c'] },
  { bg: '#fff', ink: ['#f13401', '#11804b'] },
  { bg: '#fff', ink: ['#f13401', '#11804b', '#0769ce'] },
  { bg: '#FDFCF3', ink: ['#002500'] },
  { bg: '#FDFCF3', ink: ['#2A42FF'] },
  { bg: '#FDFCF3', ink: ['#AB2A00'] },
  { bg: '#FDFCF3', ink: ['#AB2A00', '#2B0404'] },
  { bg: '#FDFCF3', ink: ['#EB562F'] },
  { bg: '#EB562F', ink: ['#2B0404'] },
  { bg: '#FDFCF3', ink: ['#EB562F', '#2B0404'] },
  { bg: '#FDFCF3', ink: ['#EB562F', '#2A42FF'] },
  { bg: '#FDFCF3', ink: ['#AB2A00'] },
  { bg: '#FDFCF3', ink: ['#AB2A00', '#2A42FF'] },
  { bg: '#FDFCF3', ink: ['#AB2A00', '#2B0404'] },
  { bg: '#FDFCF3', ink: ['#AB2A00', '#EB562F'] },
  { bg: '#FDFCF3', ink: ['#2B0404', '#EB562F'] },
  { bg: '#FDFCF3', ink: ['#CEFF00', '#2A42FF'] },
  { bg: '#CEFF00', ink: ['#2B0404'] },
  { bg: '#CEFF00', ink: ['#002500'] },
  { bg: '#ECE5F0', ink: ['#002500'] },
  { bg: '#ECE5F0', ink: ['#2A42FF'] },
  { bg: '#FDFCF3', ink: ['#EB562F', '#CEFF00', '#2A42FF'] },
  { bg: '#FDFCF3', ink: ['#AB2A00', '#CEFF00', '#2A42FF'] },
  { bg: '#FFFFFF', ink: ['#000000'] },
  { bg: '#FBF9F3', ink: ['#000000'] },
  { bg: '#FFFFFF', ink: ['#FFA500'] },
  { bg: '#FFFFFF', ink: ['#8F0202'] },
  { bg: '#FFFFFF', ink: ['#042411'] },
  { bg: '#FFFFFF', ink: ['#8F0202', '#FFA500'] },
  { bg: '#FFFFFF', ink: ['#8F0202', '#FFA500', '#042411'] },
  { bg: '#FBF9F3', ink: ['#042411'] },
  { bg: '#E5D5FF', ink: ['#042411'] },
  { bg: '#FFFFFF', ink: ['#E5D5FF'] },
  { bg: '#FFFFFF', ink: ['#FFDDDD'] },
  { bg: '#FFFFFF', ink: ['#A8F0E6'] },
  { bg: '#FFDDDD', ink: ['#8F0202'] },
  { bg: '#E5D5FF', ink: ['#8F0202'] },
  { bg: '#FFDDDD', ink: ['#8F0202', '#042411'] },
];

const { bg, ink: colors } = Random.pick(palettes);

logColors(colors);

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
    corners: Corners
  ) => {
    context.beginPath();
    context.roundRect(
      x,
      y,
      w,
      h,
      corners.map((c) => (c ? 10 : 0))
    );
    context.fill();
  },
  '013-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    [, tr, , bl]: Corners
  ) => {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w - (tr ? 10 : 0), y);
    if (tr) {
      context.arcTo(x + w, y, x + w, y + h, 10);
    }
    context.arcTo(x + w, y + h, x, y + h, w - (bl ? 10 : 0));
    if (bl) {
      context.arcTo(x, y + h, x, y + h - 10, 10);
    }
    context.closePath();
    context.fill();
  },
  '012-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    [tl, , br]: Corners
  ) => {
    context.beginPath();
    context.moveTo(x - (tl ? 10 : 0), y);
    context.lineTo(x + w, y);
    context.lineTo(x + w, y + h - (br ? 10 : 0));
    if (br) {
      context.arcTo(x + w, y + h, x, y + h, 10);
    }
    context.arcTo(
      x,
      y + h,
      x,
      y + (tl ? 10 : 0),
      w - (br ? 10 : 0) - (tl ? 10 : 0)
    );
    if (tl) {
      context.arcTo(x, y, x + 10, y, 10);
    }
    context.fill();
  },
  '023-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    [tl, , br]: Corners
  ) => {
    context.beginPath();
    context.moveTo(x, y + (tl ? 10 : 0));
    if (tl) {
      context.arcTo(x, y, x + w, y, 10);
    }
    context.arcTo(x + w, y, x + w, y + h - (br ? 10 : 0), w - (br ? 10 : 0));
    if (br) {
      context.arcTo(x + w, y + h, x, y + h, 10);
    }
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
    [, tr, , bl]: Corners
  ) => {
    context.beginPath();
    context.moveTo(x + w - (tr ? 10 : 0), y);
    if (tr) {
      context.arcTo(x + w, y, x + w, y + h, 10);
    }
    context.lineTo(x + w, y + h);
    context.lineTo(x + (bl ? 10 : 0), y + h);
    if (bl) {
      context.arcTo(x, y + h, x, y + h - 10, 10);
    }
    context.arcTo(x, y, x + w, y, w - (tr ? 10 : 0));
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

let grid = resetGrid();

function resetGrid(): GridCell[] {
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

function createArea(areaId: number) {
  const color = Random.pick(colors);
  let currentCell: GridCell = Random.pick(grid.filter((c) => !c.occupied));
  currentCell.occupied = true;
  currentCell.color = color;
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
      // Only allow unoccupied cells within bounds
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
    next.color = color;
    next.areaId = areaId;

    // only acceptable types are those that are mirrors across the shared edge
    const nextTypeOptions = cellTypes.filter((type) => {
      const currentType = currentCell.type;
      // moving right: current right edge (1), next left edge (3)
      if (dx === 1 && dy === 0) {
        return mirrors[currentType][1].indexOf(type) !== -1;
      }
      // moving left: current left edge (3), next right edge (1)
      if (dx === -1 && dy === 0) {
        return mirrors[currentType][3].indexOf(type) !== -1;
      }
      // moving down: current bottom edge (2), next top edge (0)
      if (dx === 0 && dy === 1) {
        return mirrors[currentType][2].indexOf(type) !== -1;
      }
      // moving up: current top edge (0), next bottom edge (2)
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

function fillGridWithAreas() {
  let unoccupied = grid.filter((c) => !c.occupied).length;
  let attempts = 0;
  const maxAttempts = 100;

  while (unoccupied > 0 && attempts < maxAttempts) {
    createArea(attempts);
    unoccupied = grid.filter((c) => !c.occupied).length;
    attempts++;
  }

  console.log(`Filled grid with areas in ${attempts} attempts`);
}

function reduce() {
  // if a cell doesn't share an edge with same color or
  // if none of its neighbors have the same color, then
  // change cell color to the colors that most of its neighbors have
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
              : bg
            : n.color;

          return { ...n, color };
        }
        return null;
      })
      .filter((n) => n !== null) as GridCell[];

    const sameColorNeighbors = neighbors.filter((n) => n.color === cell.color);

    if (sameColorNeighbors.length === 0) {
      // find the most common color among neighbors
      const colorCounts: Record<string, number> = {};
      neighbors.forEach((n) => {
        if (n.color) {
          colorCounts[n.color] = (colorCounts[n.color] || 0) + 1;
        }
      });
      const sortedColors = Object.entries(colorCounts).sort(
        (a, b) => b[1] - a[1]
      );
      if (sortedColors.length > 0) {
        cell.color = sortedColors[0][0];
        if (cell.color === bg) {
          cell.type = 'blank';
        }
      }
    }
  });
}

function roundCorners() {
  const neighbors = [
    [0, -1], // top
    [1, 0], // right
    [0, 1], // bottom
    [-1, 0], // left
  ];

  grid.forEach((cell) => {
    const [top, right, bottom, left] = neighbors.map(([dx, dy]) => {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      return grid[xyToIndex(nx, ny)];
    });

    // Helper to check if neighbour exists and its edge is closed
    const isOpen = (neighbour: GridCell | undefined, edge: keyof Edge) =>
      !(neighbour && edges[neighbour.type][edge]);

    // Corners are rounded if both adjacent edges are open (not closed)
    const tl = isOpen(top, '01') && isOpen(left, '10');
    const tr = isOpen(top, '01') && isOpen(right, '-10');
    const br = isOpen(bottom, '0-1') && isOpen(right, '-10');
    const bl = isOpen(bottom, '0-1') && isOpen(left, '10');

    cell.corners = [tl, tr, br, bl];
  });
}

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    grid = resetGrid();
    fillGridWithAreas();
    reduce();
    roundCorners();
    console.log(grid);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const w = (width - config.margin * 2) / config.res[0];
    const h = (height - config.margin * 2) / config.res[1];

    context.save();
    context.translate(config.margin, config.margin);

    // context.beginPath();
    // context.roundRect(0, 0, width - margin * 2, height - margin * 2, [10]);
    // context.clip();

    if (config.debug < 3) {
      grid.forEach((cell) => {
        const x = cell.x * w;
        const y = cell.y * h;

        context.fillStyle = cell.color!;
        cells[cell.type](context, x, y, w, h, cell.corners);
        if (config.debug === 1) {
          context.fillStyle = `rgb(from ${cell.color} calc(255 - r) calc(255 - g) calc(255 - b))`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.font = `32px monospace`;
          context.fillText(`${cell.type}`, x + w / 2, y + h / 2);
        }
      });
    }

    if (config.debug === 2) {
      context.strokeStyle = bg;
      context.lineWidth = 1;
      grid.forEach((cell) => {
        const x = cell.x * w;
        const y = cell.y * h;
        context.strokeRect(x, y, w, h);
      });
    }

    if (config.debug === 3) {
      context.strokeStyle = bg;
      context.lineWidth = 1;
      grid.forEach((cell, idx) => {
        const x = cell.x * w;
        const y = cell.y * h;
        context.strokeRect(x, y, w, h);

        context.fillStyle = 'red';
        const cellType = cellTypes[idx % cellTypes.length];
        cells[cellType](context, x, y, w, h, cell.corners);

        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `32px monospace`;
        context.fillText(cellType, x + w / 2, y + h / 2);
      });
    }

    // context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [1080, 1080],
  dimensions: [840, 640],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 20_000,
  playFps: 1,
  exportFps: 1,
  framesFormat: ['mp4'],
  prefix: `arcs-reduction-`,
};

ssam(sketch as Sketch<'2d'>, settings);
