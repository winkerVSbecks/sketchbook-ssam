import type { SketchProps } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawDomain } from './domain';
import { step, makeWalker, walkerToPaths } from './walker';
import { drawPath } from './paths';
import { Node, Config, DomainToWorld, Coord } from './types';
import { State } from './state';
import spawns from './spawns';

export function createNaleeSystem(
  domain: Node[] = [],
  config: Config,
  domainToWorld: DomainToWorld,
  colors: string[] = [
    '#FFDE73',
    '#EE7744',
    '#F9BC4F',
    '#2C7C79',
    '#4C4D78',
    '#FFF5E0',
  ],
  bg: string = '#101019',
  debugGrid = false
) {
  function spawnWalker(colors: string[], initialPosition?: Coord) {
    if (state.mode !== 'complete') {
      const start = initialPosition
        ? state.getPoint(initialPosition.x, initialPosition.y)
        : state.getStart();

      if (start) {
        const walker = makeWalker(
          start,
          Random.pick(colors),
          Random.pick(colors),
          config.pathStyle,
          config.flat,
          config.size,
          config.stepSize,
          state.validOption
        );
        state.setOccupied(start);
        state.walkers.push(walker);
      }
    }
  }

  const state = new State(domain);

  if (config.spawnType) {
    spawns[config.spawnType](
      (position?: Coord) => spawnWalker(colors, position),
      config.resolution,
      config.walkerCount
    );
  } else {
    spawns.random(
      (position?: Coord) => spawnWalker(colors, position),
      config.resolution,
      config.walkerCount
    );
  }
  // Spawn a bunch of random walkers
  new Array(config.walkerCount).fill(null).forEach(() => spawnWalker(colors));

  // function middleOutCross() {
  //   // middle out cross style
  //   spawnWalker(colors, { x: 0, y: 0 });
  //   spawnWalker(colors, { x: config.resolution[0], y: 0 });
  //   for (let x = 0; x < config.resolution[0]; x++) {
  //     spawnWalker(colors, { x: x, y: x % 2 === 0 ? config.resolution[1] : 0 });
  //   }
  //   for (let y = 0; y < config.resolution[1]; y++) {
  //     spawnWalker(colors, { x: y % 2 === 0 ? config.resolution[1] : 0, y: y });
  //   }
  //   spawnWalker(colors, { x: 0, y: config.resolution[1] });
  //   spawnWalker(colors, { x: config.resolution[0], y: config.resolution[1] });

  //   // spawnWalker({ x: 0, y: 0 });
  //   // spawnWalker({ x: 90, y: 0 });
  //   // for (let index = 0; index < 90; index++) {
  //   //   spawnWalker({ x: index, y: index % 2 === 0 ? 90 : 0 });
  //   //   spawnWalker({ x: index % 2 === 0 ? 90 : 0, y: index });
  //   // }
  //   // spawnWalker({ x: 0, y: 90 });
  //   // spawnWalker({ x: 90, y: 90 });
  // }

  // middleOutCross();

  let initialWalkers = true;

  console.table({
    seed: Random.getSeed(),
    size: config.size,
    stepSize: config.stepSize,
    walkerCount: config.walkerCount,
    pathStyle: config.pathStyle,
  });

  // Run the simulation to fill the grid with walkers
  while (state.mode !== 'complete') {
    state.walkers.forEach((walker) => {
      if (walker.state === 'alive') {
        const next = step(walker);
        if (next) {
          state.setOccupied(next);
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

    if (state.domain.every((cell) => cell.occupied)) {
      state.mode = 'complete';
    }
  }

  return ({ context, playhead }: SketchProps) => {
    state.walkers.forEach((walker) => {
      const paths = walkerToPaths(walker);

      const pathsInWorldCoords = paths.map((pts) => {
        return pts.map(([x, y]) => domainToWorld(x, y));
      });

      drawPath(context, walker, playhead, bg, pathsInWorldCoords);
    });

    if (debugGrid) {
      drawDomain(context, state.domain, '#000', config.size);
    }
  };
}
