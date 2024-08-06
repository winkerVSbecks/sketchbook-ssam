import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { setOccupied, validOption } from './state';
import eases from 'eases';
import { config } from './config';
import { xyToCoords } from './utils';
import type { Node, Walker } from './types';

/**
 * Walker
 */
const walkerTypes = [
  // Prefer to move horizontally
  () => {
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
  () => {
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
].concat(
  config.flat
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
);

export function makeWalker(
  start: Node,
  color: string,
  highlightColor: string
): Walker {
  start.moveTo = true;
  setOccupied(start);

  return {
    path: [start],
    lengths: [Random.range(0.5, 0.75), Random.range(0.2, 0.4)],
    color,
    highlightColor,
    state: 'alive',
    nextStep: Random.pick(walkerTypes)(),
    pathStyle: config.globalPathStyle,
    // pathStyle: config.uniformPathStyle
    //   ? config.globalPathStyle
    //   : Random.pick([
    //       'solidStyle',
    //       'pipeStyle',
    //       'distressedStyle',
    //       'highlightStyle',
    //     ]),
  };
}

export function step(walker: Walker) {
  let currentIndex = walker.path.length - 1;
  let current = walker.path[currentIndex];
  let next = walker.nextStep(current);

  if (next) {
    setOccupied(next);
    walker.path.push(next);
  } else {
    walker.state = 'dead';
  }
}

export function drawWalker(
  context: CanvasRenderingContext2D,
  walker: Walker,
  width: number,
  height: number,
  playhead: number,
  backgroundColor: string
) {
  context.strokeStyle = walker.color;
  context.lineWidth = config.size;

  const time = Math.sin(playhead * Math.PI);
  const t = eases.quadInOut(time);

  const paths = walker.path.reduce<{ x: number; y: number }[][]>(
    (acc, { x, y, moveTo }) => {
      if (moveTo) {
        acc.push([{ x, y }]);
      } else {
        acc[acc.length - 1].push({ x, y });
      }
      return acc;
    },
    []
  );

  const [l1, l2] = walker.lengths;

  paths.forEach((_pts) => {
    const pts = _pts.map(({ x, y }) => xyToCoords(x, y, width, height));
    pathStyles[walker.pathStyle](
      context,
      walker,
      pts,
      [l1, l2],
      t,
      backgroundColor
    );
  });
}

const pathStyles = {
  solidStyle,
  pipeStyle,
  distressedStyle,
  highlightStyle,
};

function solidStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = config.size - config.sizeStep;
  drawShape(context, pts, false);
  context.stroke();
}

function pipeStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  [l1, l2]: [number, number],
  t: number,
  backgroundColor: string
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  // const noiseHeadT = Random.noise3D(t, pts[0][0], pts[0][1]);
  // l1 = l1 * noiseHeadT;
  // const noiseTailT = Random.noise3D(
  //   t,
  //   pts[pts.length - 1][0],
  //   pts[pts.length - 1][1]
  // );
  // l2 = l2 * noiseTailT;

  context.setLineDash([l, 0]);
  context.lineDashOffset = 0;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // bg
  context.strokeStyle = backgroundColor;
  context.lineWidth = config.size;
  drawShape(context, pts, false);
  context.stroke();

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = config.size - config.sizeStep;
  drawShape(context, pts, false);
  context.stroke();

  // middle
  context.setLineDash([l * l1 /* 0.5 */, l]);
  context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l1) /* 0.5 */);
  context.strokeStyle = backgroundColor;
  context.lineWidth = config.size - config.sizeStep * 2;
  drawShape(context, pts, false);
  context.stroke();

  // inner
  context.setLineDash([l * l2 /* 0.3 */, l]);
  context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l2) /* 0.7 */);
  context.strokeStyle = walker.color;
  context.lineWidth = config.size - config.sizeStep * 4;
  drawShape(context, pts, false);
  context.stroke();
}

function highlightStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  [l1, _]: [number, number],
  t: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.setLineDash([l, 0]);
  context.lineDashOffset = 0;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // bg
  // context.strokeStyle = backgroundColor;
  // context.lineWidth = config.size;
  // drawShape(context, pts, false);
  // context.stroke();

  context.strokeStyle = walker.highlightColor; // walker.color;
  context.lineWidth = config.size - config.sizeStep;
  drawShape(context, pts, false);
  context.stroke();

  // middle
  const noiseHeadT = Random.noise3D(t, pts[0][0], pts[0][1]);
  const noiseTailT = Random.noise3D(
    t,
    pts[pts.length - 1][0],
    pts[pts.length - 1][1]
  );
  context.setLineDash([l * l1, l * noiseTailT]);
  context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));

  // context.setLineDash([l, l]);
  // context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(t, 0, 1, -l * 0.9, 0);
  context.strokeStyle = walker.color;
  context.lineWidth = config.size - config.sizeStep;
  drawShape(context, pts, false);
  context.stroke();
}

function distressedStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  [l1, _]: [number, number],
  t: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.setLineDash([l, 0]);
  context.lineDashOffset = 0;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const noiseHeadT = Random.noise3D(t, pts[0][0], pts[0][1]);
  const noiseTailT = Random.noise3D(
    t,
    pts[pts.length - 1][0],
    pts[pts.length - 1][1]
  );
  context.setLineDash([l * l1, l * noiseTailT]);
  context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));

  // context.setLineDash([l, l]);
  // context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(noiseHeadT, 0, 1, 0, -l * (1 - l1));
  // context.lineDashOffset = mapRange(t, 0, 1, -l * 0.9, 0);
  context.strokeStyle = walker.color;
  context.lineWidth = config.size - config.sizeStep;
  drawShape(context, pts, false);
  context.stroke();
}

function drawShape(
  context: CanvasRenderingContext2D,
  [start, ...pts]: Point[],
  closed = true
) {
  context.beginPath();
  context.moveTo(...start);
  pts.forEach((pt) => {
    context.lineTo(...pt);
  });
  if (closed) {
    context.closePath();
  }
}
