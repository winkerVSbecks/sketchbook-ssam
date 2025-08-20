import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { wcagContrast } from 'culori';
import { generateColors } from '../colors/subtractive-hue';

Random.setSeed(Random.getRandomSeed());
// Random.setSeed('134206');
console.log(Random.getSeed());

const config = {
  res: 40,
  debug: false,
  margin: 0.04,
  state: 'active',
  maxLength: [5 * 2, 25 * 2],
  count: 10,
};

let state: 'stepping_trails' | 'filling_space' | 'shifting' = 'stepping_trails';

// const colors = ['#B4B0CD', '#282665'];
const colors = generateColors('srgb', 145);
let bg = Random.pick(colors);

let [fg] = colors
  .reduce((acc: { color: string; contrast: number }[], color: string) => {
    const contrast = wcagContrast(color, bg);
    if (contrast > 1) {
      acc.push({ color, contrast });
    }
    return acc;
  }, [])
  .sort(
    (a: { contrast: number }, b: { contrast: number }) =>
      b.contrast - a.contrast
  )
  .map((color: { color: string }) => color.color);

interface Cell {
  x: number;
  y: number;
  coords: Point;
  occupied: boolean;
  variant: 'available' | 'occupied' | 'empty';
}

interface Node extends Cell {
  type: keyof typeof nodeTypes;
  direction: [number, number];
  speed: number;
}

interface Trail {
  direction: [number, number];
  x: number;
  y: number;
  nodes: Node[];
  state: 'active' | 'dead';
  maxLength: number;
}

let res: [number, number];

export const sketch = ({
  wrap,
  context,
  width,
  height,
  render,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  if (config.debug) {
    window.addEventListener('click', () => {
      render();
    });
  }

  const s = Math.min(width, height) / config.res;
  const margin = s;
  const w = width - margin * 2;
  const h = height - margin * 2;
  const grid: Cell[] = [];

  const size: [number, number] = [s, s];

  res = [Math.floor(w / size[0]), Math.floor(h / size[1])];

  for (let y = 0; y < res[1]; y++) {
    for (let x = 0; x < res[0]; x++) {
      const coords = [(x * w) / res[0], (y * h) / res[1]] as Point;
      grid.push({
        x,
        y,
        coords,
        occupied: false,
        variant: 'available',
      });
    }
  }

  const trails: Trail[] = Array.from({ length: config.count }, () =>
    initTrail(grid)
  );

  do {
    trails.forEach((trail) => {
      if (trail.state === 'active') {
        stepTrail(trail, grid);
      }
    });
  } while (trails.some((trail) => trail.state === 'active'));

  // Mark all occupied cells
  grid.forEach((cell) => {
    if (cell.occupied) {
      cell.variant = 'occupied';
    }
  });

  // Mark all neighbours of occupied cells as empty
  grid.forEach((cell) => {
    if (cell.variant === 'occupied') {
      const neighbours = getNeighbours(cell, grid);
      neighbours.forEach((n) => {
        n.variant = n.variant === 'occupied' ? n.variant : 'empty';
      });
    }
  });

  // Mark loners as empty
  // if the previous or next cell not empty then mark the cell as empty
  grid.forEach((cell) => {
    if (cell.variant === 'available') {
      const prev = grid[xyToIndex(cell.x - 1, cell.y)];
      const next = grid[xyToIndex(cell.x + 1, cell.y)];
      if (prev?.variant !== 'available' && next?.variant !== 'available') {
        cell.variant = 'empty';
      }
    }
  });

  const unOccupiedCells = grid.filter((cell) => cell.variant === 'available');

  let limit = 0;
  let limit2 = 0;
  const maxLimit = Math.max(...trails.map((trail) => trail.nodes.length));

  wrap.render = ({ width, height, frame }: SketchProps) => {
    // if (frame === 0) {
    //   limit = 0;
    //   limit2 = 0;
    // }

    if (state !== 'shifting') {
      context.fillStyle = bg;
      context.fillRect(0, 0, width, height);
    } else {
      // [fg, bg] = [bg, fg];
    }

    context.save();
    context.translate(margin, margin);

    trails.forEach((trail) => {
      drawTrail(context, size, trail, limit);
    });

    if (limit > maxLimit) {
      if (state === 'stepping_trails') {
        state = 'filling_space';
      }

      unOccupiedCells.forEach((cell, idx) => {
        if (idx > limit2) return;
        context.strokeStyle = fg;
        context.beginPath();
        context.moveTo(cell.coords[0], cell.coords[1]);
        context.lineTo(cell.coords[0] + size[0], cell.coords[1]);
        context.moveTo(cell.coords[0], cell.coords[1] + size[1] / 2);
        context.lineTo(cell.coords[0] + size[0], cell.coords[1] + size[1] / 2);
        context.moveTo(cell.coords[0], cell.coords[1] + size[1]);
        context.lineTo(cell.coords[0] + size[0], cell.coords[1] + size[1]);
        context.stroke();
      });
      limit2 += config.res / 2;

      if (limit2 > unOccupiedCells.length) {
        if (state === 'filling_space') {
          state = 'shifting';
        }
      }
    }
    if (state === 'shifting') {
      trails.forEach((trail) => {
        shiftNodes(trail, size);
      });
    }

    if (config.debug) {
      grid.forEach((cell) => {
        context.strokeStyle = fg;
        context.strokeRect(cell.coords[0], cell.coords[1], size[0], size[1]);

        // draw cell number
        context.fillStyle = cell.occupied ? bg : fg;
        context.font = '5px sans-serif';
        context.fillText(
          `${cell.x},${cell.y}`,
          cell.coords[0] + 2,
          cell.coords[1] + 12
        );
      });
    }

    context.restore();
    limit++;
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [600, 800],
  dimensions: [800, 600],
  // dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

/**
 * Trail
 */
function initTrail(grid: Cell[]): Trail {
  const start = Random.pick(grid);
  start.occupied = true;

  return {
    direction: [Random.pick([-1, 1]), Random.pick([-1, 1])],
    x: start.x,
    y: start.y,
    nodes: [
      {
        ...start,
        type: 'base',
        direction: randomDirection(),
        speed: Random.range(0.25, 1),
      },
    ],
    state: 'active',
    maxLength: Random.rangeFloor(config.maxLength[0], config.maxLength[1]),
  };
}

function stepTrail(trail: Trail, grid: Cell[]) {
  const step = [
    Random.pick([trail.direction[0], 0]),
    Random.pick([trail.direction[1], 0]),
  ];
  if (step[0] === 0 && step[1] === 0) {
    const axes = Random.pick([0, 1]);
    step[axes] = trail.direction[axes];
  }

  const next = [trail.x + step[0], trail.y + step[1]] as [number, number];

  const idx = xyToIndex(next[0], next[1]);

  if (outOfBounds(next)) {
    trail.state = 'dead';
  } else if (grid[idx]) {
    const isAvailable = !grid[idx].occupied;

    if (isAvailable) {
      const curr = trail.nodes.at(-1)!;

      const cell = grid[idx];

      const type = isAligned(curr, cell)
        ? curr.type
        : Random.pick(['base', 'chequered', 'fives']);

      cell.occupied = true;
      trail.nodes.push({
        ...cell,
        type,
        direction: randomDirection(),
        speed: Random.range(0.25, 1),
      });
      trail.x = cell.x;
      trail.y = cell.y;
    } else {
      trail.state = 'dead';
    }
  }

  if (trail.nodes.length >= trail.maxLength) {
    trail.state = 'dead';
  }
}

function shiftNodes(trail: Trail, size: [number, number]) {
  trail.nodes.forEach((node) => {
    node.coords = [
      node.coords[0] + size[0] * node.speed * node.direction[0],
      node.coords[1] + size[1] * node.speed * node.direction[1],
    ];
  });
}

const nodeTypes = {
  base: (context: CanvasRenderingContext2D, cell: Cell, size: number[]) => {
    context.fillStyle = fg;
    context.fillRect(cell.coords[0], cell.coords[1], size[0], size[1]);
  },
  chequered: (
    context: CanvasRenderingContext2D,
    cell: Cell,
    size: number[]
  ) => {
    const cellWidth = size[0] / 5;
    const cellHeight = size[1] / 5;

    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const isEven = (cell.x + cell.y + i + j) % 2 === 0;
        context.fillStyle = isEven ? bg : fg;
        context.fillRect(
          cell.coords[0] + i * cellWidth,
          cell.coords[1] + j * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }
  },
  fives: (context: CanvasRenderingContext2D, cell: Cell, size: number[]) => {
    const cellWidth = size[0] / 5;
    const cellHeight = size[1] / 5;

    context.fillStyle = fg;
    context.fillRect(cell.coords[0], cell.coords[1], size[0], size[1]);

    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const isEven = (i + j) % 2 === 0;
        if (i === 0 || j === 0 || i === 4 || j === 4) {
          // do nothing
        } else if (isEven) {
          context.fillStyle = bg;
          context.fillRect(
            cell.coords[0] + i * cellWidth,
            cell.coords[1] + j * cellHeight,
            cellWidth,
            cellHeight
          );
        }
      }
    }
  },
};

function drawTrail(
  context: CanvasRenderingContext2D,
  size: number[],
  trail: Trail,
  limit: number
) {
  trail.nodes.forEach((cell, idx) => {
    if (idx > limit) return;

    if (state === 'shifting' && idx % 2 === 0) {
      context.fillStyle = bg;
      context.fillRect(
        cell.coords[0] - cell.direction[0] * size[0],
        cell.coords[1] - cell.direction[1] * size[1],
        size[0],
        size[1]
      );
    }

    nodeTypes[cell.type](context, cell, size);
  });
}

/**
 * Utils
 */
function outOfBounds(next: [number, number]) {
  return next[0] < 0 || next[1] < 0 || next[0] >= res[0] || next[1] >= res[1];
}

function isAligned(curr: Cell, next: Cell) {
  return curr.x === next.x || curr.y === next.y;
}

function xyToIndex(x: number, y: number): number {
  return y * res[0] + x;
}

function getNeighbours(
  cell: Cell,
  grid: Cell[],
  directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]
): Cell[] {
  const neighbours = [];

  directions.push(...directions.map((d) => [d[0] * 2, d[1] * 2]));

  for (const [dx, dy] of directions) {
    const nx = cell.x + dx;
    const ny = cell.y + dy;
    const idx = xyToIndex(nx, ny);
    if (grid[idx]) {
      neighbours.push(grid[idx]);
    }
  }

  return neighbours;
}

function randomDirection() {
  return Random.pick([
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]);
}
