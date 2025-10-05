import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { carmen, bless, ellsworthKelly } from '../../colors/found';
import { logColors } from '../../colors';
import { wcagContrast } from 'culori';

Random.setSeed(Random.getRandomSeed());
// Random.setSeed('308940');
console.log(`Seed: ${Random.getSeed()}`);

const config = {
  res: 3,
  debug: 0, // 0 = none, 1 = area cells, 2 = all cells
};

export const palettes = [
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
  return y * config.res + x;
}

// 0-----1
// |     |
// 3-----2
const cells = {
  '0123': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    context.fillRect(x, y, w, h);
  },
  '013-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    context.beginPath();
    context.lineTo(x, y + h);
    context.lineTo(x + w, y);
    context.moveTo(x, y);
    context.lineTo(x, y + h);
    context.arcTo(x + w, y + h, x + w, y, w);
    context.closePath();
    context.fill();
  },
  '012-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.lineTo(x + w, y + h);
    context.arcTo(x, y + h, x, y, w);
    context.closePath();
    context.fill();
  },
  '023-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w, y + h);
    context.lineTo(x, y + h);
    context.moveTo(x, y);
    context.arcTo(x + w, y, x + w, y + h, w);
    context.closePath();
    context.fill();
  },
  '123-arc': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    context.beginPath();
    context.moveTo(x + w, y);
    context.lineTo(x + w, y + h);
    context.lineTo(x, y + h);
    context.arcTo(x, y, x + w, y, w);
    context.closePath();
    context.fill();
  },
} as const;
type CellType = keyof typeof cells;
const cellTypes = Object.keys(cells) as CellType[];

// Define mirrors for each cell type and edge
// mirrors[cellType][edgeIndex] = cellType that is a mirror across that edge
// [top, right, bottom, left]
const mirrors: Record<CellType, (CellType | null)[][]> = {
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

interface GridCell {
  x: number;
  y: number;
  occupied: boolean;
  color?: string;
  type: CellType;
  areaId?: number;
}

let grid = resetGrid();

function resetGrid(): GridCell[] {
  const result: GridCell[] = [];
  for (let y = 0; y < config.res; y++) {
    for (let x = 0; x < config.res; x++) {
      result.push({ x, y, occupied: false, type: '0123' });
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
        nx < config.res &&
        ny >= 0 &&
        ny < config.res &&
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
        if (nx >= 0 && nx < config.res && ny >= 0 && ny < config.res) {
          return grid[xyToIndex(nx, ny)];
        }
        return null;
      })
      .filter((n) => n !== null) as GridCell[];

    const sameColorNeighbors = neighbors.filter((n) => n.color === cell.color);

    if (cell.x === 2 && cell.y === 2) {
      console.log({ cell, neighbors, sameColorNeighbors });
    }

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
      }
    }
  });
}

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height, frame }: SketchProps) => {
    if (frame !== 0 /* frame % 60 === 0 */) {
      grid = resetGrid();
      fillGridWithAreas();
      reduce();
      // logColors(grid.map((cell) => cell.color!));
    }

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const w = width / config.res;
    const h = height / config.res;

    if (config.debug < 2) {
      grid.forEach((cell) => {
        const x = cell.x * w;
        const y = cell.y * h;

        context.fillStyle = cell.color!;
        cells[cell.type](context, x, y, w, h);
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
      grid.forEach((cell, idx) => {
        const x = cell.x * w;
        const y = cell.y * h;
        context.strokeRect(x, y, w, h);

        context.fillStyle = 'red';
        const cellType = cellTypes[idx % cellTypes.length];
        cells[cellType](context, x, y, w, h);

        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `32px monospace`;
        context.fillText(cellType, x + w / 2, y + h / 2);
      });
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 1,
  exportFps: 1,
  framesFormat: ['mp4'],
  prefix: `arcs-reduction-`,
};

ssam(sketch as Sketch<'2d'>, settings);
