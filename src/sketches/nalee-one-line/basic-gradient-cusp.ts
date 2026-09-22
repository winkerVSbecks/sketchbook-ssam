import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { formatCss, interpolate } from 'culori';
import { Pane } from 'tweakpane';
import { makeWalker, walkerToPaths } from '../nalee/walker';
import { drawPath, createGradientStyle } from '../nalee/paths';
import { xyToId } from '../nalee/utils';
import type { Node, Walker, Coord, DomainToWorld } from '../nalee/types';
import type { Domain } from '../domain-polygon/types';
import { logColors } from '../../colors';
import {
  ANGLE_RANGE,
  cuspPalette,
  describe,
  type CuspPalette,
  type CuspSwatch,
  type Gamut,
  type Ground,
  type Tier,
} from '../../colors/cusphanger';

/**
 * basic-gradient-cusp — nalee-one-line/basic-gradient coloured by cusphanger.
 * One Warnsdorff walk fills the grid as before, but is run to completion
 * at once and drawn as a finished line rather than grown frame by frame;
 * a Path folder in the pane sets the grid, margin and line size, and any
 * change replays the same seed's walk at the new geometry. Otherwise only
 * the colour engine changes. The palette's tinted ground is the paper, and its hues are taken
 * off the ring in order (`shuffle: false`) so everything sits on one short
 * arc of the wheel — analogous, not gapped. The line is a gradient through
 * one WCAG contrast tier (ink by default) along that arc, base hue at the
 * start of the walk and the far end at its finish, so the line travels the
 * arc as it travels the grid. Unvisited nodes take the wash tier at the
 * ground's own hue, a faint watermark of the grid. Rendered in Display P3.
 */

// One seed for the walk; the palette draws from its own seed and hands the
// walk's seed back, so Regenerate changes colours and replays the same path.
const seed = Random.getRandomSeed();
Random.setSeed(seed);
let paletteSeed = Random.getRandomSeed();

const config = {
  gap: 0,
  debug: false,
  res: Random.pick([
    [6, 6],
    [5, 5],
    [4, 4],
    [3, 3],
  ]) as [number, number],
  /** Nodes per side of the walker grid; node spacing = (1 − 2·padding)·width / gridRes. */
  gridRes: 60,
  walkerCount: 1,
  flat: true,
  padding: 0.125,
  /** Drawn line width as a fraction of node spacing, so grid and margin changes keep the proportions. */
  lineWidth: 0.6,
  /** Segment caps: round turnarounds, or square for mitred corners and ends. */
  caps: 'round' as 'round' | 'square',
  /** Inner-corner fillet as a fraction of the largest that fits, (spacing − line) / 2; 1 makes a U-turn's eye a semicircle, 0 leaves inner corners sharp. The outer edge is the caps'. */
  corner: 1,
  /** Walker size and gap in px — derived from spacing and lineWidth by applyGeometry(), not set directly. */
  size: 12,
  stepSize: 4,
  startOnCorners: false,
  /** Degrees between neighbouring hues on cusphanger's ring; rolled per palette. */
  angle: Math.round(Random.range(ANGLE_RANGE[0], ANGLE_RANGE[1])),
  /** Hues taken off the ring, in order from the base — the gradient's stops. */
  hueCount: 3,
  ground: 'random' as Ground | 'random',
  gamut: 'p3' as Gamut,
  saturation: 0.6,
  coolWarm: 0,
  /** Contrast tier the line's gradient runs through. */
  lineTier: 'high' as Tier,
  /** Contrast tier the unvisited-node dots come from (at the ground's hue). */
  nodeTier: 'low' as Tier,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

/** Read-only pane monitors: the node spacing the Path settings produce. */
const stats = { spacing: 0, linePx: 0 };
const pathFolder = pane.addFolder({ title: 'Path' });
pathFolder.addBinding(config, 'gridRes', { min: 4, max: 120, step: 1, label: 'grid' });
pathFolder.addBinding(config, 'padding', { min: 0, max: 0.4, step: 0.005, label: 'margin' });
pathFolder.addBinding(config, 'lineWidth', { min: 0.05, max: 1, step: 0.01, label: 'line (× spacing)' });
pathFolder.addBinding(config, 'caps', { options: { round: 'round', square: 'square' } });
pathFolder.addBinding(config, 'corner', { min: 0, max: 1, step: 0.05, label: 'inner radius' });
pathFolder.addBinding(stats, 'spacing', { readonly: true, format: (v: number) => v.toFixed(1) });
pathFolder.addBinding(stats, 'linePx', { readonly: true, label: 'line px', format: (v: number) => v.toFixed(1) });

const colorFolder = pane.addFolder({ title: 'Color' });
colorFolder.addBinding(config, 'angle', { min: 1, max: 180, step: 1 });
colorFolder.addBinding(config, 'hueCount', { min: 1, max: 6, step: 1 });
colorFolder.addBinding(config, 'ground', {
  options: { random: 'random', light: 'light', dark: 'dark' },
});
colorFolder.addBinding(config, 'gamut', {
  options: { p3: 'p3', srgb: 'srgb' },
});
colorFolder.addBinding(config, 'saturation', { min: 0, max: 1, step: 0.05 });
colorFolder.addBinding(config, 'coolWarm', { min: -1, max: 1, step: 0.05 });
const tierOptions = { high: 'high', mid: 'mid', low: 'low' };
colorFolder.addBinding(config, 'lineTier', { options: tierOptions });
colorFolder.addBinding(config, 'nodeTier', { options: tierOptions });
const regenBtn = colorFolder.addButton({ title: 'Regenerate palette' });

let palette: CuspPalette;
let paletteKey = '';
let bg = '';
let color = '';
let nodeColor = '';
let colorFn = interpolate(['#000', '#fff'], 'oklch');
/** Set by the sketch so a palette change can restart the walk in the new ink. */
let onPaletteChange: () => void = () => {};
/** Set by the sketch so a Path change can rebuild the grid and replay the walk. */
let onPathChange: () => void = () => {};

// The gradient reads the current `colorFn`, so a new palette recolours the
// line without rebuilding the style; the caps are baked in, so
// applyGeometry() rebuilds the style before each spawn.
const gradientColor = ({ t }: { t: number }) => formatCss(colorFn(t));
let myGradientStyle = createGradientStyle(gradientColor);

/**
 * The swatches of `tier` in arc order, base hue first. `palette.hues` is
 * sorted ascending, which can reorder an arc that wraps past 360°, so each
 * position is resolved through `palette.ring` (base first, in ring order)
 * back to the hue's index in the tiers.
 */
function swatchesAlongArc(tier: Tier): CuspSwatch[] {
  const swatches = palette.tiers[tier];
  return palette.hues.map((_, pos) => {
    const hueIndex = palette.hues.indexOf(palette.ring[pos]);
    return swatches[hueIndex >= 0 ? hueIndex : pos] ?? swatches[0];
  });
}

function ensurePalette(): boolean {
  const key = [
    paletteSeed,
    config.angle,
    config.hueCount,
    config.ground,
    config.gamut,
    config.saturation,
    config.coolWarm,
    config.lineTier,
    config.nodeTier,
  ].join('|');
  if (key === paletteKey) return false;
  Random.setSeed(paletteSeed);
  palette = cuspPalette({
    angle: config.angle,
    count: config.hueCount,
    shuffle: false,
    ground: config.ground === 'random' ? undefined : config.ground,
    gamut: config.gamut,
    saturation: config.saturation,
    coolWarm: config.coolWarm,
  });
  Random.setSeed(seed);
  bg = palette.bg.css;
  const stops = swatchesAlongArc(config.lineTier).map((sw) => sw.css);
  // culori's interpolate wants at least two stops; a single hue is flat.
  colorFn = interpolate(stops.length > 1 ? stops : [stops[0], stops[0]], 'oklch');
  color = stops[0];
  nodeColor = swatchesAlongArc(config.nodeTier)[0].css;
  paletteKey = key;
  console.log('Seed:', seed, 'Palette seed:', paletteSeed);
  console.log('Palette:', describe(palette));
  logColors(palette.colors);
  return true;
}

ensurePalette();
colorFolder.on('change', () => {
  if (ensurePalette()) onPaletteChange();
});
pathFolder.on('change', () => onPathChange());
regenBtn.on('click', () => {
  paletteSeed = Random.getRandomSeed();
  Random.setSeed(paletteSeed);
  config.angle = Math.round(Random.range(ANGLE_RANGE[0], ANGLE_RANGE[1]));
  pane.refresh();
  if (ensurePalette()) onPaletteChange();
});

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

export const sketch = ({
  wrap,
  context,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // Create domain to world coordinate transformation for walker
  const domainToWorld: DomainToWorld = (x, y) => {
    const padding = width * config.padding;
    return [
      mapRange(x, 0, config.gridRes, padding, width - padding),
      mapRange(y, 0, config.gridRes, padding, height - padding),
    ];
  };

  // Create walker domain - all possible points the walker can occupy
  let walkerDomain = makeWalkerDomain(
    [config.gridRes, config.gridRes],
    domainToWorld,
  );

  // Create state
  let state = new HamiltonianPathState(walkerDomain);

  // Spawn a single walker
  function spawnWalker(): Walker | null {
    if (state.mode === 'complete') return null;

    const start = state.getStartPoint();
    if (!start) return null;

    const walker = makeWalker(
      start,
      color,
      color,
      myGradientStyle,
      config.flat,
      config.size,
      config.stepSize,
      state.validOption,
    );
    state.setOccupied(start);
    state.walkers.push(walker);
    return walker;
  }

  // Node spacing from grid and margin; the walker's size is the full cell and
  // its gap leaves lineWidth × spacing of ink, so the stroke scales with the
  // grid. Must run before every spawn — makeWalker bakes size/stepSize in.
  function applyGeometry() {
    const spacing = (width * (1 - 2 * config.padding)) / config.gridRes;
    stats.spacing = spacing;
    stats.linePx = spacing * config.lineWidth;
    config.size = spacing;
    config.stepSize = spacing * (1 - config.lineWidth);
    // Each segment is stroked on its own, so square caps extend every
    // segment by half its width and two meeting at a turn make a square
    // corner — a miter, without needing a joined polyline.
    myGradientStyle = createGradientStyle(gradientColor, {
      lineCap: config.caps,
      lineJoin: config.caps === 'round' ? 'round' : 'miter',
      innerRadius: ((spacing - spacing * config.lineWidth) / 2) * config.corner,
    });
  }

  applyGeometry();
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

  // Reset function to restart the simulation
  function reset() {
    // Reset all walker domain points to unoccupied
    state.walkerDomain.forEach((node) => {
      node.occupied = false;
      node.moveTo = false;
    });
    // Clear walkers and state
    state.walkers = [];
    state.mode = 'draw';
    // Spawn initial walker
    currentWalker = spawnWalker();
    // Recreate the generator
    simulation = simulationGenerator();
  }

  // Draw in one go: exhaust the generator so the line is complete before
  // the first frame instead of growing over time.
  function runToCompletion() {
    let step = simulation.next();
    while (!step.done && state.mode !== 'complete') step = simulation.next();
  }

  // A Path change rebuilds the grid and replays the walk from the same seed,
  // so the same seed gives the same path at the new geometry.
  function rebuild() {
    Random.setSeed(seed);
    walkerDomain = makeWalkerDomain(
      [config.gridRes, config.gridRes],
      domainToWorld,
    );
    state = new HamiltonianPathState(walkerDomain);
    applyGeometry();
    reset();
    runToCompletion();
  }

  // A new palette restarts the walk so the line is drawn in the new ink.
  onPaletteChange = () => {
    reset();
    runToCompletion();
  };
  onPathChange = rebuild;

  runToCompletion();

  wrap.render = ({ width, height, playhead }: SketchProps) => {
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
      context.fillStyle = color;
      context.font = '16px monospace';
      context.fillText(`${occupied}/${total} nodes`, 20, 30);
    }

    state.walkers.forEach((walker) => {
      const paths = walkerToPaths(walker);
      const pathsInWorldCoords = paths.map((pts) => {
        return pts.map(([x, y]) => domainToWorld(x, y));
      });
      drawPath(context, walker, playhead, bg, pathsInWorldCoords);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  // duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);
