import { lerpArray } from 'canvas-sketch-util/math';

const PI = Math.PI;

export function drawClixo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  { base, ring, inner }: { base: string; ring: string; inner: string }
) {
  const anchors: Point[] = [
    [x, y],
    [x + 2 * r, y],
    [x + 4 * r, y],
    [x + 4 * r, y + 2 * r],
    [x + 4 * r, y + 4 * r],
    [x + 2 * r, y + 4 * r],
    [x, y + 4 * r],
    [x, y + 2 * r],
  ];

  context.fillStyle = base;
  context.strokeStyle = base;
  context.beginPath();
  context.arc(...anchors[0], r, 0.5 * PI, 2 * PI);
  context.arc(...anchors[1], r, 1 * PI, 0 * PI, true);
  context.arc(...anchors[2], r, 1 * PI, 2.5 * PI);
  context.arc(...anchors[3], r, 1.5 * PI, 0.5 * PI, true);
  context.arc(...anchors[4], r, 1.5 * PI, 1 * PI);
  context.arc(...anchors[5], r, 0 * PI, 1 * PI, true);
  context.arc(...anchors[6], r, 0 * PI, 1.5 * PI);
  context.arc(...anchors[7], r, 0.5 * PI, -0.5 * PI, true);
  context.stroke();
  context.fill();

  context.fillStyle = ring;
  context.strokeStyle = ring;
  [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
    context.beginPath();
    context.arc(...anchor, r / 2, 0, 2 * PI);

    context.stroke();
    context.fill();
  });

  context.fillStyle = inner;
  context.strokeStyle = inner;
  [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
    context.beginPath();
    context.arc(...anchor, r / 8, 0, 2 * PI);

    context.stroke();
    context.fill();
  });
}

export function drawClixoOutline(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  { fill, outline }: { fill: string; outline: string }
) {
  const anchors: Point[] = [
    [x, y],
    [x + 2 * r, y],
    [x + 4 * r, y],
    [x + 4 * r, y + 2 * r],
    [x + 4 * r, y + 4 * r],
    [x + 2 * r, y + 4 * r],
    [x, y + 4 * r],
    [x, y + 2 * r],
  ];

  context.fillStyle = fill;
  context.strokeStyle = outline;
  context.beginPath();
  context.arc(...anchors[0], r, 0.5 * PI, 2 * PI);
  context.arc(...anchors[1], r, 1 * PI, 0 * PI, true);
  context.arc(...anchors[2], r, 1 * PI, 2.5 * PI);
  context.arc(...anchors[3], r, 1.5 * PI, 0.5 * PI, true);
  context.arc(...anchors[4], r, 1.5 * PI, 1 * PI);
  context.arc(...anchors[5], r, 0 * PI, 1 * PI, true);
  context.arc(...anchors[6], r, 0 * PI, 1.5 * PI);
  context.arc(...anchors[7], r, 0.5 * PI, -0.5 * PI, true);

  context.fill();
  context.stroke();
}

// export function drawAnimatedClixo(
//   context: CanvasRenderingContext2D,
//   x: number,
//   y: number,
//   r: number,
//   { base, ring, inner }: { base: string; ring: string; inner: string },
//   t: number
// ) {
//   const a = (Math.PI / 4) * t;

//   const anchors: Point[] = [
//     rotatePoint([x, y], [x + 2 * r, y], a),
//     [x + 2 * r, y],
//     rotatePoint([x + 4 * r, y], [x + 2 * r, y], -a),
//     [x + 4 * r, y + 2 * r],
//     // lerpArray([x + 4 * r, y + 2 * r], [x + 5 * r, y + 2 * r], t),
//     rotatePoint([x + 4 * r, y + 4 * r], [x + 2 * r, y + 4 * r], a),
//     [x + 2 * r, y + 4 * r],
//     rotatePoint([x, y + 4 * r], [x + 2 * r, y + 4 * r], -a),
//     [x, y + 2 * r],
//   ];

//   context.fillStyle = base;
//   context.strokeStyle = base;
//   context.beginPath();
//   context.arc(...anchors[0], r, 0.5 * PI + a, 2 * PI + a);
//   context.arc(...anchors[1], r, 1 * PI + a, 0 * PI - a, true);
//   context.arc(...anchors[2], r, 1 * PI - a, 2.5 * PI - a);
//   context.arc(...anchors[3], r, 1.5 * PI, 0.5 * PI, true);
//   context.arc(...anchors[4], r, 1.5 * PI + a, 1 * PI + a);
//   context.arc(...anchors[5], r, 0 * PI + a, 1 * PI - a, true);
//   context.arc(...anchors[6], r, 0 * PI - a, 1.5 * PI - a);
//   context.arc(...anchors[7], r, 0.5 * PI, -0.5 * PI, true);
//   context.stroke();
//   context.fill();

//   context.fillStyle = ring;
//   context.strokeStyle = ring;
//   [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
//     context.beginPath();
//     context.arc(...anchor, r / 2, 0, 2 * PI);

//     context.stroke();
//     context.fill();
//   });

//   context.fillStyle = inner;
//   context.strokeStyle = inner;
//   [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
//     context.beginPath();
//     context.arc(...anchor, r / 8, 0, 2 * PI);

//     context.stroke();
//     context.fill();
//   });
// }

// rotate point around another point

export function rotatePoint(
  [x, y]: Point,
  [cx, cy]: Point,
  angle: number
): Point {
  return [
    Math.cos(angle) * (x - cx) - Math.sin(angle) * (y - cy) + cx,
    Math.sin(angle) * (x - cx) + Math.cos(angle) * (y - cy) + cy,
  ];
}

type Point = [number, number];

export function drawAnimatedClixo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  { base, ring, inner }: { base: string; ring: string; inner: string },
  t: number
) {
  const a = (Math.PI / 4) * t;

  // Calculate offset for side anchors based on rotation
  const offsetX = 0; //r * Math.sin(a); // Amount to move side anchors outward

  const anchors: Point[] = [
    rotatePoint([x, y], [x + 2 * r, y], a),
    [x + 2 * r, y],
    rotatePoint([x + 4 * r, y], [x + 2 * r, y], -a),
    [x + 4 * r + offsetX, y + 2 * r], // Right anchor moved outward
    rotatePoint([x + 4 * r, y + 4 * r], [x + 2 * r, y + 4 * r], a),
    [x + 2 * r, y + 4 * r],
    rotatePoint([x, y + 4 * r], [x + 2 * r, y + 4 * r], -a),
    [x - offsetX, y + 2 * r], // Left anchor moved outward
  ];

  context.fillStyle = base;
  context.strokeStyle = base;
  context.beginPath();

  // Rest of the drawing code remains the same...
  context.arc(...anchors[0], r, 0.5 * PI + a * 2, 2 * PI + a);
  context.arc(...anchors[1], r, 1 * PI + a, 0 * PI - a, true);
  context.arc(...anchors[2], r, 1 * PI - a, 2.5 * PI - a * 2);
  // context.quadraticCurveTo(5 * r, 2 * r, anchors[3][0] - r, anchors[3][1]);
  // drawSemicircleAroundPoint(context, anchors[3], r, 1.5 * PI + a / 2, 0);

  // context.arc(
  //   ...anchors[3],
  //   r,
  //   1.5 * PI + a / 2,
  //   1.5 * PI + a / 2 - Math.PI * (1 - t),
  //   true
  // );
  context.arc(...anchors[4], r, 1.5 * PI + a * 2, 1 * PI + a);
  context.arc(...anchors[5], r, 0 * PI + a, 1 * PI - a, true);
  context.arc(...anchors[6], r, 0 * PI - a, 1.5 * PI - a * 2);
  // context.arc(...anchors[7], r, 0.5 * PI, 0.5 * PI - Math.PI * (1 - t), true);
  // drawSemicircleAroundPoint(context, anchors[7], r, 0.5 * PI, 0);

  context.stroke();
  context.fill();

  // Draw the rings
  context.fillStyle = ring;
  context.strokeStyle = ring;
  [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
    context.beginPath();
    context.arc(...anchor, r / 2, 0, 2 * PI);
    context.stroke();
    context.fill();
  });

  // Draw the inner circles
  context.fillStyle = inner;
  context.strokeStyle = inner;
  [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
    context.beginPath();
    context.arc(...anchor, r / 8, 0, 2 * PI);
    context.stroke();
    context.fill();
  });
}

export function drawAnimatedClixoFlatSides(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  { base, ring, inner }: { base: string; ring: string; inner: string },
  t: number
) {
  const a = (Math.PI / 4) * t;

  const anchors: Point[] = [
    rotatePoint([x, y], [x + 2 * r, y], a),
    [x + 2 * r, y],
    rotatePoint([x + 4 * r, y], [x + 2 * r, y], -a),
    [x + 4 * r, y + 2 * r], // Right anchor moved outward
    rotatePoint([x + 4 * r, y + 4 * r], [x + 2 * r, y + 4 * r], a),
    [x + 2 * r, y + 4 * r],
    rotatePoint([x, y + 4 * r], [x + 2 * r, y + 4 * r], -a),
    [x, y + 2 * r], // Left anchor moved outward
  ];

  context.fillStyle = base;
  context.strokeStyle = base;
  context.beginPath();

  // Rest of the drawing code remains the same...
  context.arc(...anchors[0], r, 0.5 * PI + a * 2, 2 * PI + a);
  context.arc(...anchors[1], r, 1 * PI + a, 0 * PI - a, true);
  context.arc(...anchors[2], r, 1 * PI - a, 2.5 * PI - a * 2);
  context.arc(...anchors[4], r, 1.5 * PI + a * 2, 1 * PI + a);
  context.arc(...anchors[5], r, 0 * PI + a, 1 * PI - a, true);
  context.arc(...anchors[6], r, 0 * PI - a, 1.5 * PI - a * 2);

  context.stroke();
  context.fill();

  // Draw the rings
  context.fillStyle = ring;
  context.strokeStyle = ring;
  [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
    context.beginPath();
    context.arc(...anchor, r / 2, 0, 2 * PI);
    context.stroke();
    context.fill();
  });

  // Draw the inner circles
  context.fillStyle = inner;
  context.strokeStyle = inner;
  [anchors[0], anchors[2], anchors[4], anchors[6]].forEach((anchor) => {
    context.beginPath();
    context.arc(...anchor, r / 8, 0, 2 * PI);
    context.stroke();
    context.fill();
  });
}

function drawSemicircleAroundPoint(
  context: CanvasRenderingContext2D,
  [centerX, centerY]: Point,
  radius: number,
  startAngle: number,
  flatnessPercent: number = 1,
  clockwise?: boolean
) {
  const endAngle = startAngle - Math.PI;
  const startX = centerX + radius * Math.cos(startAngle);
  const startY = centerY + radius * Math.sin(startAngle);
  const endX = centerX + radius * Math.cos(endAngle);
  const endY = centerY + radius * Math.sin(endAngle);

  // For a perfect semicircle (flatness = 0), the handle length is radius * 0.5522847498
  // As we flatten, we reduce this length to 0
  const flatnessFactor = 1 - flatnessPercent / 100;
  const handleLen = radius * 0.5522847498 * flatnessFactor;

  // Middle point (leftmost point of semicircle for vertical orientation)
  const midAngle = startAngle - Math.PI / 2;
  const midX = centerX + radius * Math.cos(midAngle);
  const midY = centerY + radius * Math.sin(midAngle);

  // Adjust middle point position based on flatness
  const adjustedMidX = centerX + radius * Math.cos(midAngle) * flatnessFactor;
  const midPointPositionAdjustment = midX - adjustedMidX;

  // Calculate control points for first curve
  const cp1Angle = startAngle - Math.PI / 2;
  const cp1X =
    startX + handleLen * Math.cos(cp1Angle) - midPointPositionAdjustment * 0.5;
  const cp1Y = startY + handleLen * Math.sin(cp1Angle);

  const cp2Angle = midAngle + Math.PI / 2;
  const cp2X =
    midX + handleLen * Math.cos(cp2Angle) - midPointPositionAdjustment;
  const cp2Y = midY + handleLen * Math.sin(cp2Angle);

  // First curve
  context.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, adjustedMidX, midY);

  // Calculate control points for second curve
  const cp3Angle = midAngle - Math.PI / 2;
  const cp3X =
    midX + handleLen * Math.cos(cp3Angle) - midPointPositionAdjustment;
  const cp3Y = midY + handleLen * Math.sin(cp3Angle);

  const cp4Angle = endAngle + Math.PI / 2;
  const cp4X =
    endX + handleLen * Math.cos(cp4Angle) - midPointPositionAdjustment * 0.5;
  const cp4Y = endY + handleLen * Math.sin(cp4Angle);

  // Second curve
  context.bezierCurveTo(cp3X, cp3Y, cp4X, cp4Y, endX, endY);
}

// function drawSemicircleAroundPoint(
//   context: CanvasRenderingContext2D,
//   [centerX, centerY]: Point,
//   radius: number,
//   startAngle: number,
//   clockwise?: boolean
// ) {
//   // Calculate the start point (assume ctx is already here)
//   const startX = centerX + radius * Math.cos(startAngle);
//   const startY = centerY + radius * Math.sin(startAngle);

//   // Calculate the end angle (half circle from start)
//   const endAngle = startAngle + (clockwise ? Math.PI : -Math.PI);

//   // Calculate the end point
//   const endX = centerX + radius * Math.cos(endAngle);
//   const endY = centerY + radius * Math.sin(endAngle);

//   // For a semicircle, we'll use two cubic Bezier curves (each spanning 90 degrees)
//   // The magic number 0.5522847498 (or approximately 4/3 * tan(PI/8)) gives the best approximation
//   const handleLen = radius * 0.5522847498;

//   // First control point
//   const cp1Angle = startAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
//   const cp1X = startX + handleLen * Math.cos(cp1Angle);
//   const cp1Y = startY + handleLen * Math.sin(cp1Angle);

//   // Middle point (quarter circle from start)
//   const midAngle = startAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
//   const midX = centerX + radius * Math.cos(midAngle);
//   const midY = centerY + radius * Math.sin(midAngle);

//   // Second control point
//   const cp2Angle = midAngle - (clockwise ? Math.PI / 2 : -Math.PI / 2);
//   const cp2X = midX + handleLen * Math.cos(cp2Angle);
//   const cp2Y = midY + handleLen * Math.sin(cp2Angle);

//   // First cubic curve (from start to middle)
//   context.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, midX, midY);

//   // Third control point
//   const cp3Angle = midAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
//   const cp3X = midX + handleLen * Math.cos(cp3Angle);
//   const cp3Y = midY + handleLen * Math.sin(cp3Angle);

//   // Fourth control point
//   const cp4Angle = endAngle - (clockwise ? Math.PI / 2 : -Math.PI / 2);
//   const cp4X = endX + handleLen * Math.cos(cp4Angle);
//   const cp4Y = endY + handleLen * Math.sin(cp4Angle);

//   // Second cubic curve (from middle to end)
//   context.bezierCurveTo(cp3X, cp3Y, cp4X, cp4Y, endX, endY);
// }
