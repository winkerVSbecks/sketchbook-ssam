import Random from 'canvas-sketch-util/random';
import { mapRange, lerpFrames } from 'canvas-sketch-util/math';
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
      walker.pathStyle(context, walker, pts, playhead);
    } else {
      pathStyles[walker.pathStyle](
        context,
        walker,
        pts,
        [l1, l2],
        t,
        backgroundColor,
        playhead
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
  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();
}

function animatedLine(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  _: [number, number],
  t: number,
  backgroundColor: string,
  playhead: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';

  const time = lerpFrames([0, 1, 1, 0, 0], playhead);

  // animate the line drawing
  context.setLineDash([l, l]);
  context.lineDashOffset = lerpFrames([l, 0], time);

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

function infinitePipeStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
  _: [number, number],
  t: number,
  backgroundColor: string,
  playhead: number
) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i - 1];

    l = l + Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';

  context.strokeStyle = backgroundColor;
  context.lineWidth = walker.size;
  drawShape(context, pts, false);
  context.stroke();

  context.strokeStyle = walker.color;
  context.lineWidth = walker.size - walker.stepSize;
  drawShape(context, pts, false);
  context.stroke();

  context.save();
  context.setLineDash([l / 4, l / 2]);

  context.lineDashOffset = lerpFrames([0, 0.75 * l], playhead);
  context.strokeStyle = backgroundColor;
  context.lineWidth = 1;
  drawShape(context, pts, false);
  context.stroke();
  context.restore();
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

export type GradientColorFn = (info: {
  index: number;
  total: number;
  t: number;
  point: Point;
  nextPoint: Point;
  walker: Walker;
  playhead: number;
}) => string;

export interface GradientStyleOptions {
  /** Cap on every segment; `'square'` gives square turnarounds and ends. Default `'round'`. */
  lineCap?: CanvasLineCap;
  /** Join used where a segment is drawn as a polyline. Default `'round'`. */
  lineJoin?: CanvasLineJoin;
  /**
   * Round every turn of the path with an arc of this radius (px) so the
   * inner corner curves as well as the outer one. Clamped to half the
   * shorter adjacent segment. Default 0: sharp inner corners.
   */
  cornerRadius?: number;
}

export function createGradientStyle(
  colorFn: GradientColorFn,
  {
    lineCap = 'round',
    lineJoin = 'round',
    cornerRadius = 0,
  }: GradientStyleOptions = {}
) {
  return function gradientStyle(
    context: CanvasRenderingContext2D,
    walker: Walker,
    pts: Point[],
    playhead: number
  ) {
    context.save();
    context.lineCap = lineCap;
    context.lineJoin = lineJoin;
    context.lineWidth = walker.size - walker.stepSize;

    const total = pts.length - 1;

    if (cornerRadius > 0 && pts.length > 2) {
      // One piece per node, from the midpoint of the edge in to the midpoint
      // of the edge out, turning on an arc at the node so both sides of the
      // stroke curve. Straight runs make arcTo degenerate to a line.
      for (let i = 0; i <= total; i++) {
        const point = pts[i];
        const nextPoint = pts[Math.min(i + 1, total)];
        const color = colorFn({
          index: i,
          total,
          t: total > 0 ? i / total : 0,
          point,
          nextPoint,
          walker,
          playhead,
        });
        context.strokeStyle = color;
        context.beginPath();
        if (i === 0) {
          const out = midpoint(point, pts[1]);
          context.moveTo(point[0], point[1]);
          context.lineTo(out[0], out[1]);
        } else if (i === total) {
          const inn = midpoint(pts[i - 1], point);
          context.moveTo(inn[0], inn[1]);
          context.lineTo(point[0], point[1]);
        } else {
          const inn = midpoint(pts[i - 1], point);
          const out = midpoint(point, pts[i + 1]);
          const r = Math.min(
            cornerRadius,
            distance(pts[i - 1], point) / 2,
            distance(point, pts[i + 1]) / 2
          );
          context.moveTo(inn[0], inn[1]);
          context.arcTo(point[0], point[1], out[0], out[1], r);
          context.lineTo(out[0], out[1]);
        }
        context.stroke();
      }
      context.restore();
      return;
    }

    for (let i = 0; i < total; i++) {
      const point = pts[i];
      const nextPoint = pts[i + 1];
      const t = total > 0 ? i / total : 0;

      const color = colorFn({
        index: i,
        total,
        t,
        point,
        nextPoint,
        walker,
        playhead,
      });

      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(point[0], point[1]);
      context.lineTo(nextPoint[0], nextPoint[1]);
      context.stroke();
    }

    context.restore();
  };
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
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
  animatedLine,
  pipeStyle,
  infinitePipeStyle,
  distressedStyle,
  highlightStyle,
  stitchStyle,
  thinLineStyle,
  withNormalsStyle,
  polkaLine,
  dimpleLine,
};
