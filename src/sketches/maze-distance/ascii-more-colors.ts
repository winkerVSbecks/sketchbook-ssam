import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { generateColors } from '../../subtractive-color';

const size = 64;
const corners = Random.shuffle([
  [0, Random.rangeFloor(0, size - 1)],
  [Random.rangeFloor(0, size - 1), 0],
  [Random.rangeFloor(0, size - 1), size - 1],
  [size - 1, Random.rangeFloor(0, size - 1)],
]) as Point[];

const colors = Random.chance()
  ? generateColors()
  : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);

const config = {
  size: 64,
  start: corners.pop()! as Point,
  end: corners.pop()! as Point,
  colorCount: colors.length,
  margin: 2,
  duration: 0.02,
};

// prettier-ignore
// const CHARS = Random.shuffle('| |.|,|:|;|x|K|Ñ|R|a|+|=|-|_'.split('|'));
// const CHARS = Random.shuffle('/\\MXYZabc!?=-. '.split(''));
// const CHARS = Random.shuffle('.,-~:;=!*#$@'.split(''));
// const CHARS = Random.shuffle('└┧─┨┕┪┖┫┘┩┙┪━'.split(''));
// const CHARS = Random.shuffle('_000111'.split(''));
// const CHARS = Random.shuffle('.+abc'.split(''));
// const CHARS = Random.shuffle('┃━┏┓┗┛┣┫┳┻╋'.split(''));
// const CHARS = Random.shuffle(['▇', '▚', '▦', '▩', '◡', ' ']);
// const CHARS = Random.shuffle(['!', '§', '$', '%', '&', '/', '(', ')', '=', '?', '_',
//   '<', '>', '^', '*', '#', '-', ':', ';', '~', '.']);
const CHARS = Random.shuffle('▀▄▚▐─═0123.+?'.split(''));

// prettier-ignore
const SHUFFLE_CHARS = ['!', '§', '$', '%', '&', '/', '(', ')', '=', '?', '_',
  '<', '>', '^', '*', '#', '-', ':', ';', '~', '.'];

function letterShuffler(letter: string, t: number, start = 0, end = 1) {
  if (t <= start) return '';
  if (t > end) return letter;

  return end - t < Number.EPSILON ? letter : Random.pick(SHUFFLE_CHARS);
}

interface DGCell {
  distance: number;
  row: number;
  col: number;
  color?: string;
  char?: string;
}

interface CharCell extends DGCell {
  color: string;
  char: string;
}

interface DistanceGroup {
  cells: DGCell[];
  color: string;
}

export const sketch = ({ wrap, context, width }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const bg = colors.pop()!;
  const base = colors.pop()!;

  const maze = sidewinder(new Maze(config.size, config.size)).setStartAndEnd(
    config.start,
    config.end
  ); // binaryTree // sidewinder
  const distances = distanceGrid(maze, config.start);
  const dDomain = [0, Math.max(...distances.flat())];
  const distanceToColor = (d: number) => {
    return colors[
      Math.floor(
        mapRange(d, dDomain[0], dDomain[1], 0, config.colorCount - 1, true)
      ) % colors.length
    ];
  };

  const size = width / config.size;

  const groups: { [key: string]: DistanceGroup } = Object.fromEntries(
    colors.map((c) => [c, { color: c, cells: [] as DGCell[] }])
  );

  for (const c of maze.eachCell()) {
    const d = distances[c.row][c.col];
    const color = distanceToColor(d);

    groups[color].cells.push({
      distance: d,
      row: c.row,
      col: c.col,
    });
  }

  for (const g of Object.values(groups)) {
    g.cells.sort((a, b) => a.distance - b.distance);
  }

  const cells: CharCell[] = [];

  Object.values(groups).forEach((group, gIdx) => {
    group.cells.forEach((c) => {
      if (
        c.col < config.margin ||
        c.row < config.margin ||
        c.col > config.size - config.margin - 1 ||
        c.row > config.size - config.margin - 1
      ) {
        return;
      }

      cells.push({
        ...c,
        color: group.color,
        char: CHARS[gIdx % CHARS.length],
      });
    });
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = mapRange(playhead, 0, 0.8, 0, 1, true);

    context.font = `bold ${size}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    cells.forEach((cell, cIdx) => {
      const x = cell.col * size;
      const y = cell.row * size;

      const start = mapRange(
        cIdx,
        0,
        cells.length,
        0,
        1 - config.duration,
        true
      );
      const cT = mapRange(t, start, start + config.duration, 0, 1, true);
      const char = cT === 0 ? '·' : letterShuffler(cell.char, cT);
      const color = cT === 0 ? base : cell.color;

      context.fillStyle = color;
      context.fillText(char, x + size / 2, y + size / 2);
    });
  };
};

/**
 * Maze
 */
class Maze {
  nRows: number;
  nCols: number;
  nCells: number;
  grid!: Cell[][];
  start!: Cell;
  end!: Cell;
  srt!: Cell;

  constructor(nRows: number, nCols: number) {
    this.nRows = nRows;
    this.nCols = nCols || nRows;
    this.nCells = this.nRows * this.nCols;
    this.init();
  }

  // Initialise grid of unconnected cells.
  init() {
    this.grid = Array.from({ length: this.nRows }, (_, row) =>
      Array.from({ length: this.nCols }, (_, col) => new Cell(row, col))
    );
    for (const c of this.eachCell()) {
      c.adjacent.push(this.grid[c.row - 1]?.[c.col]);
      c.adjacent.push(this.grid[c.row][c.col + 1]);
      c.adjacent.push(this.grid[c.row + 1]?.[c.col]);
      c.adjacent.push(this.grid[c.row][c.col - 1]);
    }
  }

  // Iterate over each row in this maze.
  *eachRow() {
    for (const row of this.grid) {
      yield row;
    }
  }

  // Iterate over each cell in this maze.
  *eachCell() {
    for (const row of this.eachRow()) {
      for (const cell of row) {
        yield cell;
      }
    }
  }

  // Choose a random cell from this maze. Optionally via a seeded random number generator
  randomCell() {
    const row = Random.rangeFloor(0, this.nRows);
    const col = Random.rangeFloor(0, this.grid[row].length);
    return this.grid[row][col];
  }

  // Link together the two cells at the given pair of locations.
  link([r1, c1]: number[], [r2, c2]: number[], bidi = true) {
    this.grid[r1][c1].link(this.grid[r2][c2], bidi);
    return this;
  }

  // Add a start and end to the maze at the given coordinate pairs.
  setStartAndEnd([r1, c1]: number[], [r2, c2]: number[]) {
    // Break old links to start and end if they exist.
    this.start?.links[0].unlink(this.start);
    this.end?.links[0].unlink(this.end);

    if (r1 >= 0 || r1 < this.nRows || c1 >= 0 || c1 < this.nCols) {
      this.srt = new Cell(r1, c1, 'start');
      this.srt.link(this.grid[this.clampR(r1)][this.clampC(c1)]);
    }

    if (r2 >= 0 || r2 < this.nRows || c2 >= 0 || c2 < this.nCols) {
      this.end = new Cell(r2, c2, 'end');
      // this.end.link(this.grid[this.clampR(r2)][this.clampC(c2)]);
      this.grid[this.clampR(r2)][this.clampC(c2)].link(this.end);
    }
    return this;
  }

  // Provide a starting cell for maze navigation.
  getStart(row?: number, col?: number) {
    if (row != undefined && col != undefined) {
      return this.grid[this.clampR(row)][this.clampC(col)]; // Explict start location provided.
    }
    return this.srt?.links[0] ? this.srt.links[0] : this.grid[0][0]; // Cell linked to start with default [0,0]
  }

  clampR(row: number) {
    return Math.max(0, Math.min(row, this.nRows - 1));
  }
  clampC(col: number) {
    return Math.max(0, Math.min(col, this.nCols - 1));
  }
}

class Cell {
  row: number;
  col: number;
  adjacent: Cell[];
  links: Cell[];
  id: string;

  constructor(row: number, col: number, id?: string) {
    this.row = row;
    this.col = col;
    this.adjacent = [];
    this.links = [];
    this.id = id || toId(row, col);
  }

  // Link this cell with another either bi-directionally or unidirectionally.
  link(c: Cell, bidi = true) {
    if (c) {
      this.links.push(c);
      if (bidi) {
        c.link(this, false);
      }
    }
    return this;
  }

  // Break the link between this cell and another.
  unlink(c: Cell, bidi = true) {
    if (c) {
      this.links = this.links.filter((linkedC) => linkedC !== c);
      if (bidi) {
        c.unlink(this, false);
      }
    }
    return this;
  }

  // Is this cell linked to the given one?
  isLinked(c: Cell) {
    return this.links.includes(c);
  }
}

function toId(row: number, col: number) {
  return `${row}·${col}`;
}

function fromId(id: string) {
  const parsed = id.match(/-?\d+/g);
  if (parsed) {
    return parsed.map(Number);
  }
  return id;
}

function binaryTree(grid: Maze) {
  for (const c of grid.eachCell()) {
    c.link(Random.pick(c.adjacent.slice(0, 2).filter(Boolean)));
  }
  return grid;
}

function sidewinder(grid: Maze) {
  for (const row of grid.eachRow()) {
    const run = [];
    for (const c of row) {
      run.push(c);
      if (!c.adjacent[1] || (c.adjacent[0] && Random.rangeFloor(0, 2) === 0)) {
        const c2 = Random.pick(run);
        if (c2.adjacent[0]) {
          c2.link(c2.adjacent[0]);
          run.length = 0;
        }
      } else {
        c.link(c.adjacent[1]);
      }
    }
  }
  return grid;
}

function distanceGrid(maze: Maze, startPos: Point) {
  let [sRow, sCol] = [0, 0];
  if (startPos !== undefined) {
    [sRow, sCol] = startPos;
  } else if (maze.srt) {
    [sRow, sCol] = [maze.getStart().row, maze.getStart().col];
  }

  const distances = maze.grid.map((row) => Array(row.length).fill(Infinity));
  const startRow = maze.getStart(sRow, sCol).row;
  const startCol = maze.getStart(sRow, sCol).col;

  // Breadth first search from the starting position
  let queue = [maze.grid[startRow][startCol]];
  distances[startRow][startCol] = 0;
  while (queue.length > 0) {
    const c = queue.shift()!;

    for (let linked of c.links) {
      if (distances[linked.row]?.[linked.col] === Infinity) {
        distances[linked.row][linked.col] = distances[c.row][c.col] + 1;
        queue.push(linked);
      }
    }
  }
  return distances;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
