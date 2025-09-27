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

interface GridCell {
  x: number;
  y: number;
  occupied: boolean;
  type?: 'full' | 'split-left' | 'split-right';
}

interface Area {
  cells: GridCell[];
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
  const start = Random.pick(grid);
  start.occupied = true;

  let currentCell = { ...start, occupied: true, type: 'full' };
  area.cells.push(currentCell);

  while (true) {
    console.log(currentCell);
    const options = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]
      .filter(([dx, dy]) => {
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
      })
      .filter(([dx, dy]) => {
        // if current type is split-right
        //  next can not go to the right
        //  and next can not go down
        if (currentCell.type === 'split-right' && dx === 1 && dy === 0)
          return false;
        if (currentCell.type === 'split-right' && dx === 0 && dy === 1)
          return false;
        // if current type is split-left
        //  next can not go to the left
        if (currentCell.type === 'split-left' && dx === -1 && dy === 0)
          return false;
        if (currentCell.type === 'split-left' && dx === 0 && dy === 1)
          return false;
        return true;
      });

    if (options.length === 0) break;
    if (area.cells.length > 10) break;

    const [dx, dy] = Random.pick(options);
    const nx = currentCell.x + dx;
    const ny = currentCell.y + dy;
    const next = grid[xyToIndex(nx, ny)];
    next.occupied = true;

    let nextType = (() => {
      if (currentCell.type === 'full') {
        if (dx === -1 && dy === 0) {
          return Random.pick(['split-left', 'full']);
        } else if (dx === 1 && dy === 0) {
          return Random.pick(['split-right', 'full']);
        } else if (dx === 0 && dy === -1) {
          return Random.pick(['split-left', 'split-right', 'full']);
        } else if (dx === 0 && dy === 1) {
          return Random.pick(['split-left', 'split-right', 'full']);
        }
      } else if (currentCell.type === 'split-right') {
        if (dx === -1 && dy === 0) {
          return Random.pick(['split-left', 'full']);
        } else if (dx === 0 && dy === 1) {
          return 'split-left';
        }
      } else if (currentCell.type === 'split-left') {
        if (dx === 1 && dy === 0) {
          return Random.pick(['split-right', 'full']);
        } else if (dx === 0 && dy === 1) {
          return 'split-right';
        }
      }
      return Random.pick(['full', 'split-left', 'split-right']);
    })();

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

      if (cell.type === 'full') {
        context.fillRect(x, y, w, h);
      } else if (cell.type === 'split-left') {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + w, y);
        context.lineTo(x, y + h);
        context.closePath();
        context.fill();
      } else if (cell.type === 'split-right') {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + w, y + h);
        context.lineTo(x, y + h);
        context.closePath();
        context.fill();
      }

      context.fillStyle = 'green';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `32px monospace`;
      context.fillText(String(idx), x + w / 2, y + h / 2);
    });

    context.strokeStyle = bg;
    context.lineWidth = 1;
    grid.forEach((cell) => {
      const x = cell.x * w;
      const y = cell.y * h;
      context.strokeRect(x, y, w, h);
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
