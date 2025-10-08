import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { carmen, bless } from '../../colors/found';
import { logColors } from '../../colors';

const config = {
  res: 3,
  debug: 1, // 0 = none, 1 = area cells, 2 = all cells
};

const colors = Random.shuffle(Random.pick([carmen, bless]));
logColors(colors);
const bg = colors.pop()!;

function xyToIndex(x: number, y: number) {
  if (x < 0 || x >= config.res || y < 0 || y >= config.res) {
    return -1;
  }
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
}

interface Cell extends GridCell {
  type: CellType;
}

interface Area {
  cells: Cell[];
  color: string;
}

const grid: GridCell[] = [];

for (let y = 0; y < config.res; y++) {
  for (let x = 0; x < config.res; x++) {
    grid.push({ x, y, occupied: false });
  }
}

function createArea(): Area {
  const area: Area = { cells: [], color: Random.pick(colors) };
  const start = Random.pick(grid.filter((c) => !c.occupied));
  start.occupied = true;

  let currentCell: Cell = { ...start, occupied: true, type: '0123' };
  area.cells.push(currentCell);

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
    if (area.cells.length > 10) break;

    const [dx, dy] = Random.pick(options);
    const nx = currentCell.x + dx;
    const ny = currentCell.y + dy;
    const next = grid[xyToIndex(nx, ny)];
    next.occupied = true;

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

    currentCell = {
      ...next,
      type: nextType,
    };

    area.cells.push(currentCell);
  }

  return area;
}

function fillGridWithAreas(): Area[] {
  let unoccupied = grid.filter((c) => !c.occupied).length;
  let attempts = 0;
  const maxAttempts = 100;
  const areas: Area[] = [];

  while (unoccupied > 0 && attempts < maxAttempts) {
    const area = createArea();
    if (area.cells.length > 0) {
      unoccupied = grid.filter((c) => !c.occupied).length;
      areas.push(area);
      attempts++;
    }
  }

  console.log(`Filled grid with areas in ${attempts} attempts`);
  return areas;
}

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const areas = fillGridWithAreas();

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const w = width / config.res;
    const h = height / config.res;

    if (config.debug < 2) {
      areas.forEach((area) => {
        area.cells.forEach((cell, idx) => {
          const x = cell.x * w;
          const y = cell.y * h;

          context.fillStyle = area.color;
          cells[cell.type](context, x, y, w, h);

          if (config.debug === 1) {
            context.fillStyle = '#f0f';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.font = `32px monospace`;
            context.fillText(`${idx}-${cell.type}`, x + w / 2, y + h / 2);

            context.strokeStyle = '#f0f';
            context.strokeRect(x, y, w, h);
          }
        });
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
};

ssam(sketch as Sketch<'2d'>, settings);
