import type { SketchProps } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawDomain } from './domain';
import { step, makeWalker, walkerToPaths } from './walker';
import { drawPath } from './paths';
import { Node, Config, DomainToWorld } from './types';
import { State } from './state';

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
  function spawnWalker(colors: string[], initialPosition?: Node) {
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

  // Spawn a bunch of random walkers
  new Array(config.walkerCount).fill(null).forEach(() => spawnWalker(colors));
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
