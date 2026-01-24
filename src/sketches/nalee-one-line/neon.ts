import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import * as tome from 'chromotome';
import { makeWalker, walkerToPaths } from '../nalee/walker';
import { drawPath, drawShape } from '../nalee/paths';
import { xyToId } from '../nalee/utils';
import type { Node, Walker, Coord, DomainToWorld } from '../nalee/types';
import { logColors } from '../../colors';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
// Random.setSeed('645544');
console.log(seed);

const { colors, background: bg, stroke } = tome.get(/* 'spatial03i' */);

logColors([...colors, bg]);

const color = colors[0];

logColors([...colors, bg]);

const nodeColor =
  stroke || `rgb(from ${bg} calc(255 - r) calc(255 - g) calc(255 - b) / 0.5)`;

const config = {
  gap: 0,
  debug: false,
  res: Random.pick([
    [6, 6],
    [5, 5],
    [4, 4],
    [3, 3],
  ]) as [number, number],
  walkerRes: [10, 10], // Grid resolution for Hamiltonian path
  walkerCount: 1,
  flat: true,
  padding: 0.125,
  size: 64,
  stepSize: 4,
  stepsPerFrame: 10, // More steps per frame for faster visualization
  startOnCorners: false,
};

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
 * Direction indices for consistent ordering
 */
const DIRECTIONS: Coord[] = [
  { x: 1, y: 0 }, // right
  { x: -1, y: 0 }, // left
  { x: 0, y: 1 }, // down
  { x: 0, y: -1 }, // up
];

/**
 * Walker state using Warnsdorff's algorithm for Hamiltonian path finding
 * Warnsdorff's rule: always move to the neighbor with the fewest onward moves
 */
class HamiltonianPathState {
  walkerDomain: Node[];
  nodeMap: Map<string, Node>; // Fast lookup
  walkers: Walker[];
  mode: 'draw' | 'complete';
  totalNodes: number;
  // For backtracking: track which neighbors we've tried at each path index
  triedAtIndex: Map<number, Set<string>>;

  constructor(walkerDomain: Node[]) {
    this.walkerDomain = walkerDomain;
    this.walkers = [];
    this.mode = 'draw';
    this.totalNodes = walkerDomain.length;
    this.triedAtIndex = new Map();

    // Build fast lookup map
    this.nodeMap = new Map();
    for (const node of walkerDomain) {
      this.nodeMap.set(`${node.x},${node.y}`, node);
    }
  }

  coordToKey(coord: Coord): string {
    return `${coord.x},${coord.y}`;
  }

  getStartPoint(): Node | undefined {
    const options = this.walkerDomain.filter((p) => !p.occupied);
    if (options.length === 0) return undefined;

    // Find grid bounds
    const maxX = this.walkerDomain.reduce((max, n) => Math.max(max, n.x), 0);
    const maxY = this.walkerDomain.reduce((max, n) => Math.max(max, n.y), 0);

    // For odd×odd grids, corners are best starting points
    const corners = [
      { x: 0, y: 0 },
      { x: maxX, y: 0 },
      { x: 0, y: maxY },
      { x: maxX, y: maxY },
    ];

    // Find actual corner nodes
    const cornerNodes = corners
      .map((c) => this.getNode(c))
      .filter((n): n is Node => n !== undefined && !n.occupied);

    if (cornerNodes.length > 0 && config.startOnCorners) {
      return Random.pick(cornerNodes);
    }

    // Fallback: pick any unoccupied node
    return Random.pick(options);
  }

  getNode({ x, y }: Coord): Node | undefined {
    return this.nodeMap.get(`${x},${y}`);
  }

  isOccupied(coord: Coord): boolean {
    const node = this.getNode(coord);
    return node ? !!node.occupied : true;
  }

  setOccupied(coord: Coord): void {
    const node = this.getNode(coord);
    if (node) node.occupied = true;
  }

  setUnoccupied(coord: Coord): void {
    const node = this.getNode(coord);
    if (node) {
      node.occupied = false;
      node.moveTo = false;
    }
  }

  isInDomain(coord: Coord): boolean {
    return this.nodeMap.has(`${coord.x},${coord.y}`);
  }

  getNeighbors(point: Coord): Coord[] {
    return DIRECTIONS.map((d) => ({ x: point.x + d.x, y: point.y + d.y }));
  }

  /**
   * Get valid (unoccupied, in-domain) neighbors
   */
  getValidNeighbors(point: Coord): Coord[] {
    return this.getNeighbors(point).filter(
      (n) => this.isInDomain(n) && !this.isOccupied(n),
    );
  }

  /**
   * Count the degree (number of unvisited neighbors) of a node
   */
  getDegree(coord: Coord): number {
    return this.getValidNeighbors(coord).length;
  }

  /**
   * Warnsdorff's algorithm: get the next move by choosing the neighbor
   * with the minimum number of onward moves (lowest degree)
   * With tie-breaking using further look-ahead and randomization
   */
  getNextMoveWarnsdorff(position: Coord, pathIndex: number): Coord | null {
    const neighbors = this.getValidNeighbors(position);
    if (neighbors.length === 0) return null;

    // Get tried neighbors at this path index
    let tried = this.triedAtIndex.get(pathIndex);
    if (!tried) {
      tried = new Set<string>();
      this.triedAtIndex.set(pathIndex, tried);
    }

    // Filter out already tried neighbors
    const triedSet = tried;
    const untried = neighbors.filter((n) => !triedSet.has(this.coordToKey(n)));
    if (untried.length === 0) return null;

    // Pre-compute max coordinates
    const maxX = this.walkerDomain.reduce((max, n) => Math.max(max, n.x), 0);
    const maxY = this.walkerDomain.reduce((max, n) => Math.max(max, n.y), 0);

    // Score each untried neighbor using Warnsdorff's rule
    const scored = untried.map((n) => {
      // Temporarily mark as occupied to get accurate degree
      this.setOccupied(n);
      const degree = this.getDegree(n);
      this.setUnoccupied(n);

      // Secondary: distance from center (prefer edges/corners)
      const distFromCenter =
        Math.abs(n.x - maxX / 2) + Math.abs(n.y - maxY / 2);

      // Tertiary: random factor for tie-breaking
      const randomFactor = Random.value();

      return { coord: n, degree, distFromCenter, randomFactor };
    });

    // Sort: lowest degree first, then highest distance from center, then random
    scored.sort((a, b) => {
      if (a.degree !== b.degree) return a.degree - b.degree;
      if (Math.abs(a.distFromCenter - b.distFromCenter) > 0.5) {
        return b.distFromCenter - a.distFromCenter;
      }
      return a.randomFactor - b.randomFactor;
    });

    // Pick the best option
    const best = scored[0].coord;
    tried.add(this.coordToKey(best));
    return best;
  }

  /**
   * Greedy Warnsdorff's algorithm: get the best move without tracking
   * Uses look-ahead for tie-breaking (Pohl's improvement)
   */
  getBestMoveWarnsdorff(position: Coord): Coord | null {
    const neighbors = this.getValidNeighbors(position);
    if (neighbors.length === 0) return null;

    // Score each neighbor using Warnsdorff's rule
    const scored = neighbors.map((n) => {
      // Temporarily mark as occupied to get accurate degree
      this.setOccupied(n);
      const degree = this.getDegree(n);

      // For tie-breaking: sum of degrees of neighbors (look-ahead)
      // Lower sum = neighbors are more constrained = visit them first
      let sumNeighborDegrees = 0;
      const nNeighbors = this.getValidNeighbors(n);
      for (const nn of nNeighbors) {
        sumNeighborDegrees += this.getDegree(nn);
      }

      this.setUnoccupied(n);

      // Tertiary: random factor for final tie-breaking
      const randomFactor = Random.value();

      return { coord: n, degree, sumNeighborDegrees, randomFactor };
    });

    // Sort: lowest degree first, then lowest sum of neighbor degrees, then random
    scored.sort((a, b) => {
      if (a.degree !== b.degree) return a.degree - b.degree;
      if (a.sumNeighborDegrees !== b.sumNeighborDegrees) {
        return a.sumNeighborDegrees - b.sumNeighborDegrees;
      }
      return a.randomFactor - b.randomFactor;
    });

    return scored[0].coord;
  }

  /**
   * Clear tried moves at and after a given path index (when backtracking)
   */
  clearTriedFromIndex(fromIndex: number): void {
    for (const [idx] of this.triedAtIndex) {
      if (idx >= fromIndex) {
        this.triedAtIndex.delete(idx);
      }
    }
  }

  /**
   * Valid option for walker - anywhere in domain that's not occupied
   */
  validOption = (option: Coord): boolean => {
    return this.isInDomain(option) && !this.isOccupied(option);
  };

  getOccupiedCount(): number {
    return this.walkerDomain.filter((n) => n.occupied).length;
  }

  isComplete(): boolean {
    return this.getOccupiedCount() === this.totalNodes;
  }
}

function neonStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
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

  // Create state
  const state = new HamiltonianPathState(walkerDomain);

  // Spawn a single walker
  function spawnWalker(): Walker | null {
    if (state.mode === 'complete') return null;

    const start = state.getStartPoint();
    if (!start) return null;

    const walker = makeWalker(
      start,
      color,
      color,
      neonStyle,
      // 'solidStyle',
      config.flat,
      config.size,
      config.stepSize,
      state.validOption,
    );
    state.setOccupied(start);
    state.walkers.push(walker);
    return walker;
  }

  let currentWalker = spawnWalker();

  // Simulation generator using greedy Warnsdorff's algorithm
  // On failure, restart from a different starting point
  function* simulationGenerator(): Generator<void, void, unknown> {
    const maxAttempts = 200; // Try many starting points

    for (
      let attempt = 0;
      attempt < maxAttempts && state.mode === 'draw';
      attempt++
    ) {
      let stuck = false;

      while (!stuck && state.mode === 'draw') {
        if (!currentWalker) {
          stuck = true;
          break;
        }

        // Check if we've filled the entire domain
        if (state.isComplete()) {
          state.mode = 'complete';
          console.log(`Hamiltonian path found on attempt ${attempt + 1}!`);
          break;
        }

        const current = currentWalker.path[currentWalker.path.length - 1];

        // Use greedy Warnsdorff's algorithm to get next move
        const nextCoord = state.getBestMoveWarnsdorff(current);

        if (nextCoord) {
          // Found a valid move - advance
          const targetNode = state.getNode(nextCoord);
          if (targetNode) {
            currentWalker.path.push(targetNode);
            state.setOccupied(nextCoord);
            yield; // Pause for animation
          }
        } else {
          // No valid moves - stuck
          stuck = true;
          const coverage = (
            (state.getOccupiedCount() / state.totalNodes) *
            100
          ).toFixed(1);
          if (attempt % 10 === 0) {
            console.log(
              `Attempt ${attempt + 1} stuck at ${coverage}% (${state.getOccupiedCount()}/${state.totalNodes})`,
            );
          }
        }
      }

      // If not complete, try a new starting point
      if (stuck && state.mode === 'draw') {
        // Reset everything
        state.walkerDomain.forEach((node) => {
          node.occupied = false;
          node.moveTo = false;
        });
        state.walkers = [];
        currentWalker = spawnWalker();
        yield;
      }
    }

    if (state.mode === 'draw') {
      console.log('Could not find Hamiltonian path after all attempts');
      state.mode = 'complete';
    }
  }

  // Create the generator instance
  let simulation = simulationGenerator();

  // Run the entire simulation to completion before rendering
  while (state.mode !== 'complete') {
    simulation.next();
  }

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw walker domain points
    context.fillStyle = nodeColor;
    state.walkerDomain.forEach(({ worldX, worldY, occupied }) => {
      if (!occupied) {
        context.beginPath();
        context.arc(worldX, worldY, 2, 0, Math.PI * 2);
        context.fill();
      }
    });

    if (config.debug) {
      // Draw progress info
      const occupied = state.getOccupiedCount();
      const total = state.totalNodes;
      context.fillStyle = colors[0];
      context.font = '16px monospace';
      context.fillText(`${occupied}/${total} nodes`, 20, 30);
    }

    context.lineJoin = 'round';
    context.lineCap = 'round';

    const walker = state.walkers[0];

    const paths = walkerToPaths(walker);
    const pathsInWorldCoords = paths.map((pts) => {
      return pts.map(([x, y]) => domainToWorld(x, y));
    });

    // Draw soft shadow for the main path
    drawPath(context, walker, playhead, bg, pathsInWorldCoords);
  };
};

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
