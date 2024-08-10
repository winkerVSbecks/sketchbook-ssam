import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import eases from 'eases';
import type { Walker } from './types';

export function drawPath(
  context: CanvasRenderingContext2D,
  walker: Walker,
  playhead: number,
  backgroundColor: string,
  paths: Line[]
) {
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size;

  const time = Math.sin(playhead * Math.PI);
  const t = eases.quadInOut(time);

  const [l1, l2] = walker.lengths;

  paths.forEach((pts) => {
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

function solidStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
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
  context.lineWidth = walker.size;
  drawShape(context, pts, false);
  context.stroke();

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();

  // middle
  context.setLineDash([l * l1 /* 0.5 */, l]);
  context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l1) /* 0.5 */);
  context.strokeStyle = backgroundColor;
  context.lineWidth = walker.size - walker.stepSize * 2;
  drawShape(context, pts, false);
  context.stroke();

  // inner
  context.setLineDash([l * l2 /* 0.3 */, l]);
  context.lineDashOffset = mapRange(t, 0, 1, 0, -l * (1 - l2) /* 0.7 */);
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize * 4;
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
  // context.lineWidth = walker.size;
  // drawShape(context, pts, false);
  // context.stroke();

  context.strokeStyle = walker.highlightColor; // walker.color;
  context.lineWidth = walker.size - walker.stepSize;
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
  context.lineWidth = walker.size - walker.stepSize;
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
  context.lineWidth = walker.size - walker.stepSize;
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

const pathStyles = {
  solidStyle,
  pipeStyle,
  distressedStyle,
  highlightStyle,
};
