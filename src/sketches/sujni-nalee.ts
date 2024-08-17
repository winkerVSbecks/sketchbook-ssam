import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import { mapRange } from 'canvas-sketch-util/math';
import PolyBool from 'polybooljs';
import {
  createNaleeSystem,
  makeDomain,
  clipDomainWithWorldCoords,
  xyToCoords,
} from './nalee';
import type { Config as NaleeConfig } from './nalee';
import { palettes } from '../mindful-palettes';

Random.setSeed(Random.getRandomSeed());
const size = Random.pick([6, 16, 24, 32, 64]); //64;

const corners = Random.shuffle([
  [0, Random.rangeFloor(0, size - 1)],
  [Random.rangeFloor(0, size - 1), 0],
  [Random.rangeFloor(0, size - 1), size - 1],
  [size - 1, Random.rangeFloor(0, size - 1)],
]) as Point[];

const colors = Random.pick(palettes);

const config = {
  size,
  start: corners.pop()! as Point,
  end: corners.pop()! as Point,
  colorCount: colors.length - 1,
};

const naleeSize = Random.pick([6, 9, 12]);
const naleeConfig = {
  resolution: Math.floor(1080 / naleeSize),
  size: naleeSize,
  stepSize: naleeSize / 3,
  walkerCount: 30,
  padding: 0.03125, // 1 / 32
  pathStyle: Random.pick(['pipeStyle', 'solidStyle']), // 'pipeStyle', //'solidStyle',
  flat: true,
} satisfies NaleeConfig;

interface DGCell {
  path: Line;
  distance: number;
  row: number;
  col: number;
  id: string;
  color: string;
}

interface DistanceGroup {
  cells: DGCell[];
  color: string;
}

// Based on:
// https://observablehq.com/@jwolondon/mazes
// https://observablehq.com/@jwolondon/mazes-traversing
export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  function drawRegion(vertices: any, color: string) {
    if (vertices.length > 0) {
      drawPath(context, vertices);
      context.fillStyle = color;
      context.fill();
    }
  }

  const bg = colors.pop()!;

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
      )
    ];
  };

  const size = width / config.size;

  function scale([x, y]: Point): Point {
    return [x * size, y * size];
  }

  function scalePath(pts: Line): Line {
    return pts.map(scale);
  }

  const cells: DGCell[] = [];

  for (const c of maze.eachCell()) {
    const [x1, y1, x2, y2] = [c.col, c.row, c.col + 1, c.row + 1];

    const path = scalePath([
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ]) as Line;

    const d = distances[c.row][c.col];
    const color = distanceToColor(d);

    if (color) {
      cells.push({
        path,
        distance: d,
        row: c.row,
        col: c.col,
        id: c.id,
        color,
      });
    }
  }

  // Correct colors
  const findCellById = (row: number, col: number) => {
    const id = toId(row, col);
    return cells.find((c) => c.id === id);
  };
  const getAdjacent = (row: number, col: number) => {
    return [
      findCellById(row - 1, col),
      findCellById(row, col + 1),
      findCellById(row + 1, col),
      findCellById(row, col - 1),
    ];
  };
  function countDuplicates(arr: any[]): { [key: string]: number } {
    const counts: { [key: string]: number } = {};

    arr.forEach((item) => {
      counts[item] = (counts[item] || 0) + 1;
    });

    return counts;
  }

  for (const c of cells) {
    const neighbours = getAdjacent(c.row, c.col);
    const neighbourColors = neighbours.map((n) => n?.color).filter(Boolean);
    const counts = countDuplicates(neighbourColors);
    // Get color with most duplicates
    const [color, count] = Object.entries(counts).reduce((a, b) =>
      a[1] > b[1] ? a : b
    );

    if (count >= 2 || !neighbourColors.includes(c.color)) {
      c.color = color;
    }
  }

  const groups: { [key: string]: DistanceGroup } = Object.fromEntries(
    colors.map((c: string) => [c, { color: c, cells: [] as DGCell[] }])
  );

  for (const c of cells) {
    groups[c.color].cells.push(c);
  }

  for (const g of Object.values(groups)) {
    g.cells.sort((a, b) => a.distance - b.distance);
  }

  const boundaries: Line[] = [];
  for (const c of maze.eachCell()) {
    const [x1, y1, x2, y2] = [c.col, c.row, c.col + 1, c.row + 1];

    for (const c1 of c.adjacent.filter(Boolean)) {
      if (c1.col > c.col && !c.isLinked(c1)) {
        // Consider cell to east
        boundaries.push(
          scalePath([
            [x2, y1],
            [x2, y2],
          ])
        );
      } else if (c1.row > c.row && !c.isLinked(c1)) {
        // Consider cell to south
        boundaries.push([scale([x1, y2]), scale([x2, y2])]);
      }
    }
  }

  const groupPolygons: { color: string; regions: Line[] }[] = [];
  for (const [c, g] of Object.entries(groups)) {
    const polygons = g.cells.map((c) => ({ regions: [c.path] }));
    const union = polygons.reduce(
      (acc, p) => {
        return PolyBool.union(acc, p);
      },
      { regions: [] }
    );

    groupPolygons.push({ color: c, regions: union.regions });
  }

  const domainToWorld = xyToCoords(
    naleeConfig.resolution,
    naleeConfig.padding,
    width,
    height
  );

  const naleeSystems: ((props: SketchProps) => void)[] = [];

  // One global domain
  const domain = makeDomain(naleeConfig.resolution, domainToWorld);

  // Generate nalee system for each region
  Object.values(groupPolygons).forEach(({ color, regions }) => {
    regions.forEach((region) => {
      const clippedDomain = clipDomainWithWorldCoords(domain, region);
      const naleeSystem = createNaleeSystem(
        clippedDomain,
        naleeConfig,
        domainToWorld,
        [color],
        bg,
        false
      );
      naleeSystems.push(naleeSystem);
    });
  });

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    naleeSystems.forEach((naleeSystem) => {
      naleeSystem(props);
    });

    // Object.values(groupPolygons).forEach(({ color, regions }) => {
    //   context.fillStyle = color;

    //   regions.forEach((region) => {
    //     drawRegion(region, color);
    //   });
    // });
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

  // Breadth first search from the startng position
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
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
