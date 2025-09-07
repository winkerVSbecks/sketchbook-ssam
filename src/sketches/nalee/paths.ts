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
    if (typeof walker.pathStyle === 'function') {
      walker.pathStyle(context, walker, pts);
    } else {
      pathStyles[walker.pathStyle](
        context,
        walker,
        pts,
        [l1, l2],
        t,
        backgroundColor
      );
    }
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
  context.save();
  context.translate(4, 4);
  context.strokeStyle = '#CEFF00';
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();
  context.restore();

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

function stitchStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash([walker.stepSize, walker.stepSize * 2]);

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = Math.max(walker.size / 4, 2);
  drawShape(context, pts, false);
  context.stroke();
  context.restore();
}

function thinLineStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = Math.max(walker.size / 4, 2);
  drawShape(context, pts, false);
  context.stroke();
}

function withNormalsStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = Math.max(walker.size / 4, 1);

  const d = walker.stepSize * 0.75;

  // Calculate normals for each point
  const normals = pts.map((pt, i) => {
    const a = pts[i - 1] || pt;
    const b = pts[i + 1] || pt;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);

    return dx === 0 || dy === 0
      ? ([(-dy / len) * d, (dx / len) * d] as Point)
      : [0, 0];
  });

  // Draw the path
  drawShape(context, pts, false);
  context.stroke();

  // Draw the normals
  pts.forEach((pt, i) => {
    const [nx, ny] = normals[i];
    context.beginPath();
    context.moveTo(pt[0] - nx, pt[1] - ny);
    context.lineTo(pt[0], pt[1]);
    context.lineTo(pt[0] + nx, pt[1] + ny);
    context.stroke();
  });
}

function polkaLine(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const width = walker.size - walker.stepSize;

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = width;

  // Draw the path
  drawShape(context, pts, false);
  context.stroke();

  const r = Math.max(width / 4, 2);

  pts.forEach((pt) => {
    context.beginPath();
    context.ellipse(pt[0], pt[1], r, r, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function dimpleLine(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[]
) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const width = walker.size - walker.stepSize;

  // outer
  context.strokeStyle = walker.color;
  context.lineWidth = width / 4;

  // Draw the path
  drawShape(context, pts, false);
  context.stroke();

  context.fillStyle = walker.color;
  pts.forEach((pt) => {
    context.beginPath();
    context.ellipse(pt[0], pt[1], width / 2, width / 2, 0, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

export function drawShape(
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

export const pathStyles = {
  solidStyle,
  pipeStyle,
  distressedStyle,
  highlightStyle,
  stitchStyle,
  thinLineStyle,
  withNormalsStyle,
  polkaLine,
  dimpleLine,
};
