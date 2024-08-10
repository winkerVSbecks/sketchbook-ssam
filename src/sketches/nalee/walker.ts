import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import eases from 'eases';
import type { Node, Walker, Coord, PathStyle } from './types';

/**
 * Walker
 */

const walkerTypes = [
  // Prefer to move horizontally
  (validOption: (node: Coord) => boolean) => {
    let preferredOption = Random.pick([0, 1]);

    return ({ x, y }: Node) => {
      const options = [
        { x: x + 1, y: y },
        { x: x - 1, y: y },
        { x: x, y: y + 1 },
        { x: x, y: y - 1 },
      ];
      let preferred = options[preferredOption];

      // Try bouncing once
      if (!validOption(preferred)) {
        preferredOption = preferredOption === 0 ? 1 : 0;
        preferred = options[preferredOption];
      }

      if (validOption(preferred)) {
        return preferred;
      }

      return Random.pick(options.filter((s) => validOption(s)));
    };
  },
  // Prefer to move vertically
  (validOption: (node: Coord) => boolean) => {
    let preferredOption = Random.pick([2, 3]);

    return ({ x, y }: Node) => {
      const options = [
        { x: x + 1, y: y },
        { x: x - 1, y: y },
        { x: x, y: y + 1 },
        { x: x, y: y - 1 },
      ];
      let preferred = options[preferredOption];

      // Try bouncing once
      if (!validOption(preferred)) {
        preferredOption = preferredOption === 2 ? 3 : 2;
        preferred = options[preferredOption];
      }

      if (validOption(preferred)) {
        return preferred;
      }

      return Random.pick(options.filter((s) => validOption(s)));
    };
  },
]; /* .concat(
  walker.flat
    ? []
    : [
        () =>
          // Makes the walker squiggly
          ({ x, y }: Node) =>
            Random.pick(
              [
                { x: x + 1, y: y },
                { x: x - 1, y: y },
                { x: x, y: y + 1 },
                { x: x, y: y - 1 },
              ].filter((s) => validOption(s))
            ),
      ]
) */

export function makeWalker(
  start: Node,
  color: string,
  highlightColor: string,
  pathStyle: PathStyle,
  size: number,
  stepSize: number,
  validOption: (node: Coord) => boolean
): Walker {
  start.moveTo = true;

  return {
    path: [start],
    lengths: [Random.range(0.5, 0.75), Random.range(0.2, 0.4)],
    color,
    highlightColor,
    state: 'alive',
    nextStep: Random.pick(walkerTypes)(validOption),
    pathStyle,
    size,
    stepSize,
  };
}

export function step(walker: Walker): Coord | void {
  let currentIndex = walker.path.length - 1;
  let current = walker.path[currentIndex];
  let next = walker.nextStep(current);

  if (next) {
    walker.path.push(next);
    return next;
  }

  walker.state = 'dead';
}

export function walkerToPaths(walker: Walker): Line[] {
  const paths = walker.path.reduce<Coord[][]>((acc, { x, y, moveTo }) => {
    if (moveTo) {
      acc.push([{ x, y }]);
    } else {
      acc[acc.length - 1].push({ x, y });
    }
    return acc;
  }, []);

  return paths.map((pts) => {
    return pts.map(({ x, y }) => [x, y]);
  });
}
