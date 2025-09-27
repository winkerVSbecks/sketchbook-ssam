import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { carmen, bless } from '../../colors/found';
import { logColor } from '../../colors';

const config = {
  res: 3,
};

const colors = Random.shuffle(Random.pick([carmen, bless]));
const bg = colors.pop()!;

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
  '013': (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.lineTo(x, y + h);
    context.closePath();
    context.fill();
  },
  '012': (
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
    context.closePath();
    context.fill();
  },
  '023': (
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
    context.closePath();
    context.fill();
  },
  '123': (
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
    context.closePath();
    context.fill();
  },
} as const;
type CellType = keyof typeof cells;
const cellTypes = Object.keys(cells) as CellType[];

interface Cell {
  x: number;
  y: number;
  occupied: boolean;
  type?: CellType;
}

interface Area {
  cells: Cell[];
  color: string;
}

const grid: Cell[] = [];

for (let y = 0; y < config.res; y++) {
  for (let x = 0; x < config.res; x++) {
    grid.push({ x, y, occupied: false });
  }
}

function createArea(): Area {
  const area: Area = { cells: [], color: Random.pick(colors) };
  const start = Random.pick(grid);
  start.occupied = true;

  let currentCell: Cell = { ...start, occupied: true, type: '0123' };
  area.cells.push(currentCell);

  while (true) {
    console.log(currentCell);
    const options = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
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

    // only acceptable types are those that share an edge with current cell
    const nextTypeOptions = cellTypes.filter((type) => {
      if (type === currentCell.type) return true; // always allow same type

      const sharedEdges: Record<CellType, CellType[]> = {
        '0123': ['0123', '013', '012', '023', '123'],
        '013': ['0123', '013', '123'],
        '012': ['0123', '012', '123'],
        '023': ['0123', '023', '123'],
        '123': ['0123', '013', '012', '023', '123'],
      } as const;

      const allowed = sharedEdges[currentCell.type!];
      return allowed.includes(type);
    });

    if (nextTypeOptions.length === 0) break;

    const nextType = Random.pick(nextTypeOptions);
    // let nextType = cellTypes.filter()

    currentCell = {
      ...next,
      type: nextType,
    };

    area.cells.push(currentCell);
  }

  return area;
}

const area = createArea();
console.log(area);
logColor(area.color);

// there's actually four orientations of split cells
//  split-left along bottom or top
//  split-right along bottom or top

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const w = width / config.res;
    const h = height / config.res;

    area.cells.forEach((cell, idx) => {
      const x = cell.x * w;
      const y = cell.y * h;

      context.fillStyle = area.color;
      cells[cell.type](context, x, y, w, h);

      context.fillStyle = 'green';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `32px monospace`;
      context.fillText(String(idx), x + w / 2, y + h / 2);
    });

    context.strokeStyle = bg;
    context.lineWidth = 1;
    grid.forEach((cell, idx) => {
      const x = cell.x * w;
      const y = cell.y * h;
      context.strokeRect(x, y, w, h);

      // const type: CellType[] = ['0123', '013', '012', '023', '123'];
      // context.fillStyle = area.color;
      // cells[type[idx % type.length]](context, x, y, w, h);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
