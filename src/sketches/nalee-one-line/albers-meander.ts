import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { makeWalker, walkerToPaths } from '../nalee/walker';
import { drawShape } from '../nalee/paths';
import { xyToId } from '../nalee/utils';
import type { Node, Walker, Coord, DomainToWorld } from '../nalee/types';

const seed = Random.getRandomSeed();
Random.setSeed(seed);
console.log('seed:', seed);

const bg = '#F4D5C4';
const fg = '#C75C3B';
const white = '#F8F2EE';

const config = {
  walkerRes: [16, 20] as [number, number],
  flat: true,
  padding: 0.1,
  size: 52,
  stepSize: 8,
  startOnCorners: true,
};

function makeWalkerDomain(
  resolution: [number, number],
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

const DIRECTIONS: Coord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

class HamiltonianPathState {
  walkerDomain: Node[];
  nodeMap: Map<string, Node>;
  walkers: Walker[];
  mode: 'draw' | 'complete';
  totalNodes: number;

  constructor(walkerDomain: Node[]) {
    this.walkerDomain = walkerDomain;
    this.walkers = [];
    this.mode = 'draw';
    this.totalNodes = walkerDomain.length;
    this.nodeMap = new Map();
    for (const node of walkerDomain) {
      this.nodeMap.set(`${node.x},${node.y}`, node);
    }
  }

  getStartPoint(): Node | undefined {
    const options = this.walkerDomain.filter((p) => !p.occupied);
    if (options.length === 0) return undefined;

    const maxX = this.walkerDomain.reduce((max, n) => Math.max(max, n.x), 0);
    const maxY = this.walkerDomain.reduce((max, n) => Math.max(max, n.y), 0);

    if (config.startOnCorners) {
      const corners = [
        { x: 0, y: 0 },
        { x: maxX, y: 0 },
        { x: 0, y: maxY },
        { x: maxX, y: maxY },
      ];
      const cornerNodes = corners
        .map((c) => this.getNode(c))
        .filter((n): n is Node => n !== undefined && !n.occupied);
      if (cornerNodes.length > 0) return Random.pick(cornerNodes);
    }

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

  getValidNeighbors(point: Coord): Coord[] {
    return DIRECTIONS.map((d) => ({ x: point.x + d.x, y: point.y + d.y })).filter(
      (n) => this.isInDomain(n) && !this.isOccupied(n),
    );
  }

  getDegree(coord: Coord): number {
    return this.getValidNeighbors(coord).length;
  }

  getBestMoveWarnsdorff(position: Coord): Coord | null {
    const neighbors = this.getValidNeighbors(position);
    if (neighbors.length === 0) return null;

    const scored = neighbors.map((n) => {
      this.setOccupied(n);
      const degree = this.getDegree(n);
      let sumNeighborDegrees = 0;
      for (const nn of this.getValidNeighbors(n)) {
        sumNeighborDegrees += this.getDegree(nn);
      }
      this.setUnoccupied(n);
      return { coord: n, degree, sumNeighborDegrees, randomFactor: Random.value() };
    });

    scored.sort((a, b) => {
      if (a.degree !== b.degree) return a.degree - b.degree;
      if (a.sumNeighborDegrees !== b.sumNeighborDegrees)
        return a.sumNeighborDegrees - b.sumNeighborDegrees;
      return a.randomFactor - b.randomFactor;
    });

    return scored[0].coord;
  }

  validOption = (option: Coord): boolean =>
    this.isInDomain(option) && !this.isOccupied(option);

  getOccupiedCount(): number {
    return this.walkerDomain.filter((n) => n.occupied).length;
  }

  isComplete(): boolean {
    return this.getOccupiedCount() === this.totalNodes;
  }
}

function meanderStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.globalAlpha = 0.88;
  context.strokeStyle = fg;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();

  context.globalAlpha = 0.55;
  context.strokeStyle = bg;
  context.lineWidth = (walker.size - walker.stepSize) * 0.38;
  drawShape(context, pts, false);
  context.stroke();

  context.restore();
}

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const margin = width * 0.07;

  const domainToWorld: DomainToWorld = (x, y) => {
    const pad = width * config.padding + margin;
    return [
      mapRange(x, 0, config.walkerRes[0], pad, width - pad),
      mapRange(y, 0, config.walkerRes[1], pad, height - pad),
    ];
  };

  const walkerDomain = makeWalkerDomain(config.walkerRes, domainToWorld);
  const state = new HamiltonianPathState(walkerDomain);

  function spawnWalker(): Walker | null {
    if (state.mode === 'complete') return null;
    const start = state.getStartPoint();
    if (!start) return null;
    const walker = makeWalker(
      start,
      fg,
      fg,
      'solidStyle',
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

  function* simulationGenerator(): Generator<void, void, unknown> {
    for (let attempt = 0; attempt < 200 && state.mode === 'draw'; attempt++) {
      let stuck = false;
      while (!stuck && state.mode === 'draw') {
        if (!currentWalker) { stuck = true; break; }
        if (state.isComplete()) { state.mode = 'complete'; break; }

        const current = currentWalker.path[currentWalker.path.length - 1];
        const nextCoord = state.getBestMoveWarnsdorff(current);

        if (nextCoord) {
          const targetNode = state.getNode(nextCoord);
          if (targetNode) {
            currentWalker.path.push(targetNode);
            state.setOccupied(nextCoord);
            yield;
          }
        } else {
          stuck = true;
        }
      }

      if (stuck && state.mode === 'draw') {
        state.walkerDomain.forEach((node) => {
          node.occupied = false;
          node.moveTo = false;
        });
        state.walkers = [];
        currentWalker = spawnWalker();
        yield;
      }
    }

    if (state.mode === 'draw') state.mode = 'complete';
  }

  const simulation = simulationGenerator();
  while (state.mode !== 'complete') {
    simulation.next();
  }

  wrap.render = ({ width, height }: SketchProps) => {
    // White outer border
    context.fillStyle = white;
    context.fillRect(0, 0, width, height);

    // Light pink interior
    context.fillStyle = bg;
    context.fillRect(margin, margin, width - 2 * margin, height - 2 * margin);

    const walker = state.walkers[0];
    if (!walker) return;

    const paths = walkerToPaths(walker);
    const pathsInWorld = paths.map((pts) => pts.map(([x, y]) => domainToWorld(x, y)));

    pathsInWorld.forEach((pts) => {
      meanderStyle(context, walker, pts);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1350],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
