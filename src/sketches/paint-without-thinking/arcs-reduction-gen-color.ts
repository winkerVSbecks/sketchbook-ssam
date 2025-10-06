import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { carmen, bless } from '../../colors/found';
import { logColors } from '../../colors';
import { wcagContrast } from 'culori';

Random.setSeed(Random.getRandomSeed());
// Random.setSeed('308940');
console.log(`Seed: ${Random.getSeed()}`);

const config = {
  res: 3,
  debug: 0, // 0 = none, 1 = area cells, 2 = all cells
};

const baseColors: string[] = Random.shuffle(Random.pick([carmen, bless]));
const backgroundOptions = baseColors.filter((color) => {
  const luminance = wcagContrast(color, '#000');
  return luminance >= 4.0;
});
const bg = Random.shuffle(backgroundOptions).pop()!;
// only pick colors that have sufficient contrast with bg
const colors = baseColors
  .filter((color) => {
    return !backgroundOptions.includes(color);
  })
  .filter((color) => {
    const contrast = wcagContrast(color, bg);
    return contrast >= 3.0;
  })
  // limit to colors that have sufficient contrast with each other
  .filter((color, index) => {
    for (let i = 0; i < index; i++) {
      const otherColor = baseColors[i];
      const contrast = wcagContrast(color, otherColor);
      if (contrast < 4.0) return false;
    }
    return true;
  });

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
    if (frame % 60 === 0) {
      grid = resetGrid();
      fillGridWithAreas();
      reduce();
      logColors(grid.map((cell) => cell.color!));
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
  animate: false,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
