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
  gap: 0,
  debug: true,
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
 * Split walker domain points into grid cells based on which domain they fall into.
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
  currentPosition: Coord | null;
  visitedCells: Set<GridCell>;

  constructor(walkerDomain: Node[], gridCells: GridCell[]) {
    this.walkerDomain = walkerDomain;
    this.gridCells = gridCells;
    this.walkers = [];
    this.mode = 'draw';
    this.currentGridCell = null;
    this.currentPosition = null;
    this.visitedCells = new Set();
  }

  getStartInCell(cell: GridCell) {
    const options = cell.points.filter((p) => !p.occupied);
    return Random.pick(options);
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

  getNode({ x, y }: Coord): Node | undefined {
    return this.walkerDomain.find((n) => n.x === x && n.y === y);
  }

  /**
   * Check if a point is in a specific cell
   */
  isInCell(point: Coord, cell: GridCell): boolean {
    return cell.points.some((p) => p.x === point.x && p.y === point.y);
  }

  /**
   * Check if a point exists in the walker domain
   */
  isInDomain(point: Coord): boolean {
    return this.walkerDomain.some((p) => p.x === point.x && p.y === point.y);
  }

  /**
   * Get all 4 neighbors of a point
   */
  getNeighbors(point: Coord): Coord[] {
    return [
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
    ];
  }

  /**
   * Strictly constrain walker to current cell only
   */
  validOptionInCell = (option: Coord) => {
    if (!this.currentGridCell) return false;
    if (this.isOccupied(option)) return false;
    return this.isInCell(option, this.currentGridCell);
  };

  /**
   * Find valid unoccupied neighbors that are in an adjacent cell
   * (neighbor can be in both current cell and adjacent cell - boundary points)
   */
  findValidNeighborInAdjacentCell(
    position: Coord,
    currentCell: GridCell,
  ): { neighbor: Coord; cell: GridCell } | null {
    const neighbors = this.getNeighbors(position);

    for (const neighbor of Random.shuffle(neighbors)) {
      if (this.isOccupied(neighbor)) continue;
      if (!this.isInDomain(neighbor)) continue;

      // Check if neighbor is in a different unvisited cell
      // (it might also be in current cell - that's OK for boundary points)
      for (const cell of Random.shuffle([...this.gridCells])) {
        if (cell === currentCell) continue;
        if (this.visitedCells.has(cell)) continue;

        if (this.isInCell(neighbor, cell)) {
          return { neighbor, cell };
        }
      }
    }

    return null;
  }

  /**
   * Backtrack through walker path to find a position with valid neighbor in adjacent cell
   */
  backtrackToFindTransition(
    walker: Walker,
    currentCell: GridCell,
  ): { position: Coord; neighbor: Coord; cell: GridCell } | null {
    // Go backwards through the path
    for (let i = walker.path.length - 1; i >= 0; i--) {
      const position = walker.path[i];
      const result = this.findValidNeighborInAdjacentCell(
        position,
        currentCell,
      );

      if (result) {
        return { position, ...result };
      }
    }

    return null;
  }
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

  // Spawn walker in a cell
  function spawnWalker(initialCell?: GridCell): Walker | null {
    if (state.mode === 'complete') return null;

    const cell = initialCell || Random.pick(gridCells);
    if (!cell || cell.points.length === 0) return null;

    state.currentGridCell = cell;
    state.visitedCells.add(cell);
    const start = state.getStartInCell(cell);

    if (start) {
      state.currentPosition = start;
      const walker = makeWalker(
        start,
        Random.pick(colors),
        Random.pick(colors),
        'solidStyle',
        config.flat,
        config.size,
        config.stepSize,
        state.validOptionInCell, // Strictly constrained to current cell
      );
      state.setOccupied(start);
      state.walkers.push(walker);
      return walker;
    }
    return null;
  }

  // Start with a random cell
  const initialCell = Random.shuffle([...gridCells])[0];
  let currentWalker = spawnWalker(initialCell);

  // Run simulation
  function runSimulation() {
    let maxSteps = config.walkerRes[0] * config.walkerRes[1] * 4;

    while (state.mode !== 'complete' && maxSteps > 0) {
      maxSteps--;

      if (!currentWalker || !state.currentGridCell) {
        state.mode = 'complete';
        break;
      }

      if (currentWalker.state === 'alive') {
        const current = currentWalker.path[currentWalker.path.length - 1];
        state.currentPosition = current;

        const next = step(currentWalker);
        if (next) {
          state.setOccupied(next);
        }
      }

      // Walker is stuck - try to backtrack and transition to adjacent cell
      if (currentWalker.state === 'dead') {
        const transition = state.backtrackToFindTransition(
          currentWalker,
          state.currentGridCell,
        );

        if (transition) {
          // Found a valid transition point
          const { position, neighbor, cell } = transition;

          // Find the index of the backtrack position in the path
          const backtrackIndex = currentWalker.path.findIndex(
            (p) => p.x === position.x && p.y === position.y,
          );

          // Add the backtrack path (reversed) from current position to the transition point
          if (
            backtrackIndex >= 0 &&
            backtrackIndex < currentWalker.path.length - 1
          ) {
            for (
              let i = currentWalker.path.length - 2;
              i >= backtrackIndex;
              i--
            ) {
              const backtrackNode = currentWalker.path[i];
              // Create a copy to avoid modifying the original
              currentWalker.path.push({
                ...backtrackNode,
                moveTo: false,
              });
            }
          }

          // Get the node for the neighbor to add to path
          const neighborNode = state.getNode(neighbor);
          if (neighborNode) {
            // Add transition step to adjacent cell
            currentWalker.path.push(neighborNode);
            state.setOccupied(neighbor);

            // Transition to new cell
            state.currentGridCell = cell;
            state.visitedCells.add(cell);
            currentWalker.state = 'alive';

            // Update walker's nextStep to use new cell constraint
            // Use a dummy node copy to avoid makeWalker setting moveTo=true on neighborNode
            const dummyStart: Node = { ...neighborNode, moveTo: false };
            currentWalker.nextStep = makeWalker(
              dummyStart,
              currentWalker.color,
              currentWalker.highlightColor,
              currentWalker.pathStyle,
              config.flat,
              currentWalker.size,
              currentWalker.stepSize,
              state.validOptionInCell,
            ).nextStep;
          }
        } else {
          // // No valid transition found - try to spawn a new walker
          // const cellsWithSpace = gridCells.filter((cell) =>
          //   cell.points.some((p) => !p.occupied),
          // );

          // if (cellsWithSpace.length > 0) {
          //   // Spawn new walker in a cell with space
          //   const newCell = Random.pick(cellsWithSpace);
          //   state.visitedCells.clear(); // Reset visited cells for new walker
          //   currentWalker = spawnWalker(newCell);
          // } else {
          //   // No cells with space left - truly done
          //   state.mode = 'complete';
          // }
          state.mode = 'complete';
        }
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
