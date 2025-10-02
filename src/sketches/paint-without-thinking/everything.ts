import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { carmen, bless } from '../../colors/found';
import { logColors } from '../../colors';

const config = {
  res: 3,
  debug: false,
};

const colors = Random.shuffle(Random.pick([carmen, bless]));
logColors(colors);
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

// Define edges for each cell type
// Edges are defined as [top, right, bottom, left]
type Edge = [boolean, boolean, boolean, boolean];
const edges: Record<CellType, Edge> = {
  '0123': [true, true, true, true],
  '013': [true, false, false, true],
  '013-arc': [true, false, false, true],
  '012': [true, true, false, false],
  '012-arc': [true, true, false, false],
  '023': [false, false, true, true],
  '023-arc': [false, false, true, true],
  '123': [false, true, true, false],
  '123-arc': [false, true, true, false],
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

    // only acceptable types are those that share an edge with current cell
    const nextTypeOptions = cellTypes.filter((type) => {
      // Compare edges based on next cell position
      // if moving right, current right edge must match next left edge
      // if moving left, current left edge must match next right edge
      // if moving down, current bottom edge must match next top edge
      // if moving up, current top edge must match next bottom edge
      const currentEdges = edges[currentCell.type];
      const nextEdges = edges[type];

      // moving right
      if (
        dx === 1 &&
        dy === 0 &&
        currentEdges[1] === nextEdges[3] &&
        currentEdges[1] &&
        nextEdges[3]
      ) {
        return true;
        // moving left
      } else if (
        dx === -1 &&
        dy === 0 &&
        currentEdges[3] === nextEdges[1] &&
        currentEdges[3] &&
        nextEdges[1]
      ) {
        return true;
        // moving down
      } else if (
        dx === 0 &&
        dy === 1 &&
        currentEdges[2] === nextEdges[0] &&
        currentEdges[2] &&
        nextEdges[0]
      ) {
        return true;
        // moving up
      } else if (
        dx === 0 &&
        dy === -1 &&
        currentEdges[0] === nextEdges[2] &&
        currentEdges[0] &&
        nextEdges[2]
      ) {
        return true;
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

    areas.forEach((area) => {
      area.cells.forEach((cell, idx) => {
        const x = cell.x * w;
        const y = cell.y * h;

        context.fillStyle = area.color;
        cells[cell.type](context, x, y, w, h);

        if (config.debug) {
          context.fillStyle = 'green';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.font = `32px monospace`;
          context.fillText(String(idx), x + w / 2, y + h / 2);
        }
      });
    });

    if (config.debug) {
      context.strokeStyle = bg;
      context.lineWidth = 1;
      grid.forEach((cell, idx) => {
        const x = cell.x * w;
        const y = cell.y * h;
        context.strokeRect(x, y, w, h);

        context.fillStyle = 'red'; // colors[idx % colors.length];
        cells[cellTypes[idx % cellTypes.length]](context, x, y, w, h);
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
