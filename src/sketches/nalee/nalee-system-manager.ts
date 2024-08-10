import type { SketchProps } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { makeGrid /* drawGrid */ } from './grid';
import { inBounds, toWorld, xyToIndex } from './utils';
import { step, makeWalker, walkerToPaths } from './walker';
import { drawPath } from './paths';
import { Node, State, Coord, Config } from './types';

Random.setSeed('nalee');

export function createNaleeSystem(
  colors: string[] = [
    '#FFDE73',
    '#EE7744',
    '#F9BC4F',
    '#2C7C79',
    '#4C4D78',
    '#FFF5E0',
    '#101019',
  ],
  size = 12,
  configOverrides: Partial<Config> = {}
) {
  const config: Config = {
    resolution: Math.floor(1080 / size),
    size: size,
    stepSize: size / 3,
    walkerCount: 30,
    padding: 0.03125, // 1 / 32
    pathStyle: 'solidStyle',
    ...configOverrides,
  };

  const state: State = {
    grid: [],
    walkers: [],
    pts: [],
    mode: 'draw',
  };

  function spawnWalker(colors: string[], initialPosition?: Node) {
    if (state.mode !== 'complete') {
      const start = initialPosition
        ? getPoint(initialPosition.x, initialPosition.y)
        : getStart();

      if (start) {
        const walker = makeWalker(
          start,
          Random.pick(colors),
          Random.pick(colors),
          config.pathStyle,
          config.size,
          config.stepSize,
          validOption
        );
        setOccupied(start);
        state.walkers.push(walker);
      }
    }
  }

  function getPoint(x: number, y: number) {
    return state.grid.find((node) => node.x === x && node.y === y);
  }

  function getStart() {
    const options = state.grid.filter((cell) => !cell.occupied);
    return Random.pick(options);
  }

  function isOccupied({ x, y }: Coord) {
    const idx = xyToIndex(state.grid, x, y);
    return state.grid[idx].occupied;
  }

  function setOccupied({ x, y }: Coord) {
    const idx = xyToIndex(state.grid, x, y);
    if (idx >= 0) {
      state.grid[idx].occupied = true;
    }
  }

  function validOption(option: Coord) {
    return inBounds(state.grid, option) && !isOccupied(option);
  }

  const bg = colors.pop()!;

  state.grid = makeGrid(config.resolution);

  // Spawn a bunch of random walkers
  new Array(config.walkerCount).fill(null).forEach(() => spawnWalker(colors));

  // Run the simulation to fill the grid with walkers
  let initialWalkers = true;

  console.table({
    seed: Random.getSeed(),
    size: config.size,
    stepSize: config.stepSize,
    walkerCount: config.walkerCount,
    pathStyle: config.pathStyle,
  });

  while (state.mode !== 'complete') {
    state.walkers.forEach((walker) => {
      if (walker.state === 'alive') {
        const next = step(walker);
        if (next) {
          setOccupied(next);
        }
      }
    });

    // spawn new walkers if there are dead ones
    const activeWalkers = state.walkers.filter(
      (walker) => walker.state === 'alive'
    );

    if (activeWalkers.length === 0 && initialWalkers) {
      initialWalkers = false;
    }

    if (activeWalkers.length === 0 && !initialWalkers) {
      spawnWalker(colors);
    }

    if (state.grid.every((cell) => cell.occupied)) {
      state.mode = 'complete';
    }
  }

  function xyToCoords(
    x: number,
    y: number,
    width: number,
    height: number
  ): Point {
    return [
      toWorld(x, width, config.resolution, width * config.padding),
      toWorld(y, height, config.resolution, width * config.padding),
    ];
  }

  return ({ context, width, height, playhead }: SketchProps) => {
    state.walkers.forEach((walker) => {
      const paths = walkerToPaths(walker);

      const pathsInWorldCoords = paths.map((pts) => {
        return pts.map(([x, y]) => xyToCoords(x, y, width, height));
      });

      drawPath(context, walker, playhead, bg, pathsInWorldCoords);
    });

    // drawGrid(
    //   context,
    //   state.grid,
    //   width,
    //   height,
    //   '#ccc',
    //   config.size,
    // );
  };
}
