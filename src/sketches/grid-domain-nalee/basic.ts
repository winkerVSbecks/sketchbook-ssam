import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { generateDomainSystem } from '../domain-polygon/domain-polygon-system';
import { makeWalker, step, walkerToPaths } from '../nalee/walker';
import { drawPath } from '../nalee/paths';
import { xyToId } from '../nalee/utils';
import type { Node, Walker, Coord, DomainToWorld } from '../nalee/types';
import type { Domain } from '../domain-polygon/types';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log(seed);

const outline = '#333';
const gridLines = '#aaa';
const bg = '#fff';

const colors = ['#FFDE73', '#EE7744', '#F9BC4F', '#2C7C79', '#4C4D78'];

const config = {
  gap: 0.02,
  debug: false,
  res: Random.pick([
    [6, 6],
    [5, 5],
    [4, 4],
    [3, 3],
  ]) as [number, number],
  walkerRes: [60, 60],
  walkerCount: 1,
  flat: false,
  padding: 0.125,
  size: 12,
  stepSize: 4,
};

interface GridCell {
  domain: Domain;
  points: Node[];
}

/**
 * Create a walker domain - a grid of points that the walker can occupy
 */
function makeWalkerDomain(
  resolution: number[],
  domainToWorld: DomainToWorld,
): Node[] {
  const domain: Node[] = [];

  for (let y = 0; y <= resolution[1]; y++) {
    for (let x = 0; x <= resolution[0]; x++) {
      const [worldX, worldY] = domainToWorld(x, y);
      domain.push({ x, y, occupied: false, id: xyToId(x, y), worldX, worldY });
    }
  }

  return domain;
}

/**
 * Split walker domain points into grid cells based on which domain they fall into
 */
function splitDomainIntoGridCells(
  walkerDomain: Node[],
  domains: Domain[],
): GridCell[] {
  return domains.map((domain) => {
    const points = walkerDomain.filter(({ worldX, worldY }) => {
      return (
        worldX >= domain.x &&
        worldX <= domain.x + domain.width &&
        worldY >= domain.y &&
        worldY <= domain.y + domain.height
      );
    });

    return { domain, points };
  });
}

/**
 * Find which grid cell a point belongs to
 */
function findGridCellForPoint(
  gridCells: GridCell[],
  { x, y }: Coord,
): GridCell | undefined {
  return gridCells.find((cell) =>
    cell.points.some((p) => p.x === x && p.y === y),
  );
}

/**
 * Walker state that tracks current grid cell
 */
class GridConstrainedState {
  walkerDomain: Node[];
  gridCells: GridCell[];
  walkers: Walker[];
  mode: 'draw' | 'complete';
  currentGridCell: GridCell | null;

  constructor(walkerDomain: Node[], gridCells: GridCell[]) {
    this.walkerDomain = walkerDomain;
    this.gridCells = gridCells;
    this.walkers = [];
    this.mode = 'draw';
    this.currentGridCell = null;
  }

  getPoint(x: number, y: number) {
    if (!this.currentGridCell) return undefined;
    return this.currentGridCell.points.find(
      (node) => node.x === x && node.y === y,
    );
  }

  getStartInCell(cell: GridCell) {
    const options = cell.points.filter((p) => !p.occupied);
    return Random.pick(options);
  }

  getStart() {
    if (!this.currentGridCell) return undefined;
    return this.getStartInCell(this.currentGridCell);
  }

  isOccupied({ x, y }: Coord) {
    const node = this.walkerDomain.find((n) => n.x === x && n.y === y);
    return node ? node.occupied : true;
  }

  setOccupied({ x, y }: Coord) {
    const node = this.walkerDomain.find((n) => n.x === x && n.y === y);
    if (node) {
      node.occupied = true;
    }
  }

  /**
   * Check if point is valid - must be in current grid cell and not occupied
   */
  validOption = (option: Coord) => {
    if (!this.currentGridCell) return false;

    const inCurrentCell = this.currentGridCell.points.some(
      (p) => p.x === option.x && p.y === option.y,
    );

    return inCurrentCell && !this.isOccupied(option);
  };

  /**
   * Check if point is in a different grid cell (for transition detection)
   */
  getNewGridCell(option: Coord): GridCell | undefined {
    const newCell = findGridCellForPoint(this.gridCells, option);
    if (newCell && newCell !== this.currentGridCell) {
      return newCell;
    }
    return undefined;
  }

  /**
   * Expanded valid option that allows crossing into adjacent cells
   */
  validOptionWithTransition = (option: Coord) => {
    // First check if valid in current cell
    if (this.validOption(option)) {
      return true;
    }

    // Check if the point is in an adjacent cell and not occupied
    const newCell = findGridCellForPoint(this.gridCells, option);
    if (newCell && !this.isOccupied(option)) {
      return true;
    }

    return false;
  };
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  // Generate grid cell domains
  const { domains, grid } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    {
      inset: [0, 0, 0, 0],
      doCombineSmallRegions: true,
      doCombineNarrowRegions: true,
      doReduceNarrowRegions: true,
    },
  );

  // Create domain to world coordinate transformation for walker
  const domainToWorld: DomainToWorld = (x, y) => {
    const padding = width * config.padding;
    return [
      mapRange(x, 0, config.walkerRes[0], padding, width - padding),
      mapRange(y, 0, config.walkerRes[1], padding, height - padding),
    ];
  };

  // Create walker domain - all possible points the walker can occupy
  const walkerDomain = makeWalkerDomain(config.walkerRes, domainToWorld);

  // Split walker domain into grid cells
  const gridCells = splitDomainIntoGridCells(walkerDomain, domains);

  // Create state
  const state = new GridConstrainedState(walkerDomain, gridCells);

  // Spawn walkers
  function spawnWalker(initialCell?: GridCell) {
    if (state.mode === 'complete') return;

    // Pick a random grid cell if not specified
    const cell = initialCell || Random.pick(gridCells);
    if (!cell || cell.points.length === 0) return;

    state.currentGridCell = cell;
    const start = state.getStartInCell(cell);

    if (start) {
      const walker = makeWalker(
        start,
        Random.pick(colors),
        Random.pick(colors),
        'solidStyle',
        config.flat,
        config.size,
        config.stepSize,
        state.validOptionWithTransition,
      );
      state.setOccupied(start);
      state.walkers.push(walker);
    }
  }

  // // Spawn initial walkers in different grid cells
  // const shuffledCells = Random.shuffle([...gridCells]);
  // for (let i = 0; i < Math.min(config.walkerCount, shuffledCells.length); i++) {
  //   spawnWalker(shuffledCells[i]);
  // }
  spawnWalker(Random.shuffle([...gridCells])[0]);

  // Run simulation
  function runSimulation() {
    let maxSteps = config.walkerRes[0] * config.walkerRes[1] * 2;

    while (state.mode !== 'complete' && maxSteps > 0) {
      maxSteps--;

      state.walkers.forEach((walker) => {
        if (walker.state === 'alive') {
          const current = walker.path[walker.path.length - 1];

          // Update current grid cell based on walker's position
          const currentCell = findGridCellForPoint(gridCells, current);
          if (currentCell) {
            state.currentGridCell = currentCell;
          }

          const next = step(walker);
          if (next) {
            state.setOccupied(next);

            // Check if walker moved to a new grid cell
            const newCell = state.getNewGridCell(next);
            if (newCell) {
              state.currentGridCell = newCell;
            }
          }
        }
      });

      // Spawn new walkers if all are dead
      const activeWalkers = state.walkers.filter((w) => w.state === 'alive');

      if (activeWalkers.length === 0) {
        // Find cells with unoccupied points
        const cellsWithSpace = gridCells.filter((cell) =>
          cell.points.some((p) => !p.occupied),
        );

        if (cellsWithSpace.length > 0) {
          // spawnWalker(Random.pick(cellsWithSpace));
        } else {
          state.mode = 'complete';
        }
      }

      // Check if all points are occupied
      if (state.walkerDomain.every((p) => p.occupied)) {
        state.mode = 'complete';
      }
    }
  }

  runSimulation();

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw grid cell domains
    context.strokeStyle = outline;
    context.lineWidth = 2;
    context.fillStyle = bg;
    domains.forEach((d) => {
      context.beginPath();
      context.rect(d.x, d.y, d.width, d.height);
      context.fill();
      context.stroke();
    });

    // Draw walkers
    state.walkers.forEach((walker) => {
      const paths = walkerToPaths(walker);
      const pathsInWorldCoords = paths.map((pts) => {
        return pts.map(([x, y]) => domainToWorld(x, y));
      });
      drawPath(context, walker, playhead, bg, pathsInWorldCoords);
    });

    // Debug: draw grid lines
    if (config.debug) {
      context.strokeStyle = gridLines;
      context.lineWidth = 0.5;

      for (let x = grid.x; x <= grid.x + grid.w; x += grid.xRes) {
        context.beginPath();
        context.moveTo(x + grid.gap / 2, grid.y);
        context.lineTo(x + grid.gap / 2, grid.y + grid.h);
        context.stroke();
      }
      for (let y = grid.y; y <= grid.y + grid.h; y += grid.yRes) {
        context.beginPath();
        context.moveTo(grid.x, y + grid.gap / 2);
        context.lineTo(grid.x + grid.w, y + grid.gap / 2);
        context.stroke();
      }

      // Draw walker domain points
      context.fillStyle = 'rgba(0,0,0,0.2)';
      state.walkerDomain.forEach(({ worldX, worldY, occupied }) => {
        if (!occupied) {
          context.beginPath();
          context.arc(worldX, worldY, 2, 0, Math.PI * 2);
          context.fill();
        }
      });
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
