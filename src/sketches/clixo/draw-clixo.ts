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
  const PI = Math.PI;

  // Calculate corner points (the 4 corners with circles)
  const cornerAnchors: Point[] = [
    rotatePoint([x, y], [x + 2 * r, y], a), // top-left
    rotatePoint([x + 4 * r, y], [x + 2 * r, y], -a), // top-right
    rotatePoint([x + 4 * r, y + 4 * r], [x + 2 * r, y + 4 * r], a), // bottom-right
    rotatePoint([x, y + 4 * r], [x + 2 * r, y + 4 * r], -a), // bottom-left
  ];

  // Middle points (top, right, bottom, left)
  const midAnchors: Point[] = [
    [x + 2 * r, y], // top middle
    [x + 4 * r, y + 2 * r], // right middle
    [x + 2 * r, y + 4 * r], // bottom middle
    [x, y + 2 * r], // left middle
  ];

  context.fillStyle = base;
  context.strokeStyle = base;
  context.beginPath();

  // Start path at the rightmost point of the top-left circle
  const startAngle1 = 0.5 * PI + a * 2;
  const endAngle1 = 2 * PI + a;
  const startX1 = cornerAnchors[0][0] + r * Math.cos(startAngle1);
  const startY1 = cornerAnchors[0][1] + r * Math.sin(startAngle1);

  context.moveTo(startX1, startY1);

  // Draw top-left corner arc
  context.arc(...cornerAnchors[0], r, startAngle1, endAngle1);

  // Draw top horizontal segment with arc
  context.arc(...midAnchors[0], r, 1 * PI + a, 0 * PI - a, true);

  // Draw top-right corner arc
  context.arc(...cornerAnchors[1], r, 1 * PI - a, 2.5 * PI - a * 2);

  // Draw right vertical segment as a single smooth bezier curve
  // Calculate the exit point from the top-right corner
  const exitAngle1 = 2.5 * PI - a * 2;
  const exitX1 = cornerAnchors[1][0] + r * Math.cos(exitAngle1);
  const exitY1 = cornerAnchors[1][1] + r * Math.sin(exitAngle1);

  // Calculate the entry point to the bottom-right corner
  const entryAngle1 = 1.5 * PI + a * 2;
  const entryX1 = cornerAnchors[2][0] + r * Math.cos(entryAngle1);
  const entryY1 = cornerAnchors[2][1] + r * Math.sin(entryAngle1);

  // Calculate tangent directions - these must be EXACTLY perpendicular to the radius
  // to match the circle's curvature at the connection points
  const exitTangentAngle1 = exitAngle1 + PI / 2;
  const entryTangentAngle1 = entryAngle1 - PI / 2;

  // Calculate segment length and use it to determine control point distance
  const segmentLength = Math.abs(entryY1 - exitY1);

  // Let's create a smooth three-part curve instead of trying to deform a single curve

  // 1. First, calculate the middle point of the vertical segment
  const midX = (exitX1 + entryX1) / 2;
  const midY = (exitY1 + entryY1) / 2;

  // 2. Calculate how much the midpoint should be offset inward (negative X = left)
  // When circles rotate outward, we need to reduce the inward pinch
  // Calculate the horizontal distance between circles (when circles move out, this increases)
  const circleDistance = Math.abs(cornerAnchors[1][0] - cornerAnchors[2][0]);
  // Base offset on both radius and the position of circles - decreases as circles move outward
  const midPointOffset = -r * 0.3 * (1 - t * 0.25); // Reduce pinching as t increases

  // 3. Calculate control points to match circle curvature
  // The magic constant for matching circle curvature perfectly
  const kappa = 0.5522847498; // 4/3 * tan(π/8)

  // Calculate first control point - positioned to match circle curvature
  const tan1Length = r * kappa; // This precisely matches a circle's curvature
  const ctrl1X1 = exitX1 + Math.cos(exitTangentAngle1) * tan1Length;
  const ctrl1Y1 = exitY1 + Math.sin(exitTangentAngle1) * tan1Length;

  // Calculate middle point with offset
  const midPointX = midX + midPointOffset;

  // Calculate the intermediate control points that create a smooth transition
  // Adjust these positions carefully to blend smoothly between circles and middle
  const ctrl1MidX = (exitX1 + midPointX) * 0.5 + midPointOffset * 0.1;
  const ctrl1MidY = (exitY1 + midY) * 0.5;

  // Now we'll draw a bezier curve from exit point to mid point
  const ctrlMidX1 = (midPointX + exitX1) / 2;
  const ctrlMidY1 = (midY + exitY1) / 2;

  const midControlX1 = midPointX - midPointOffset * 0.2; // Slight adjustment for smooth transition

  // Calculate the handle length for the middle point
  // This needs to be long enough to create a smooth transition
  const midHandleLength1 = segmentLength * 0.25; // 25% of segment length works well

  // First curve: from exit to middle
  // Use the same X position but make the handle perfectly vertical (only Y changes)
  context.bezierCurveTo(
    ctrl1X1,
    ctrl1Y1,
    midPointX, // Keep X aligned with midpoint for vertical handle
    midY - midHandleLength1, // Handle extends directly upward
    midPointX,
    midY
  );

  // Calculate control points for bottom half
  const tan2Length = r * kappa;
  const ctrl2X1 = entryX1 + Math.cos(entryTangentAngle1) * tan2Length;
  const ctrl2Y1 = entryY1 + Math.sin(entryTangentAngle1) * tan2Length;

  // Second curve: from middle to entry
  // Again, keep the handle perfectly vertical at the middle point
  context.bezierCurveTo(
    midPointX, // Keep X aligned with midpoint for vertical handle
    midY + midHandleLength1, // Handle extends directly downward
    ctrl2X1,
    ctrl2Y1,
    entryX1,
    entryY1
  );

  // Draw bottom-right corner arc
  context.arc(...cornerAnchors[2], r, entryAngle1, 1 * PI + a);

  // Draw bottom horizontal segment with arc
  context.arc(...midAnchors[2], r, 0 * PI + a, 1 * PI - a, true);

  // Draw bottom-left corner arc
  context.arc(...cornerAnchors[3], r, 0 * PI - a, 1.5 * PI - a * 2);

  // Draw left vertical segment as a single smooth bezier curve
  // Calculate the exit point from the bottom-left corner
  const exitAngle2 = 1.5 * PI - a * 2;
  const exitX2 = cornerAnchors[3][0] + r * Math.cos(exitAngle2);
  const exitY2 = cornerAnchors[3][1] + r * Math.sin(exitAngle2);

  // Calculate the entry point to the top-left corner
  const entryAngle2 = 0.5 * PI + a * 2;
  const entryX2 = cornerAnchors[0][0] + r * Math.cos(entryAngle2);
  const entryY2 = cornerAnchors[0][1] + r * Math.sin(entryAngle2);

  // Calculate tangent directions - these must be EXACTLY perpendicular to the radius
  // (Note the different signs compared to the right side!)
  const exitTangentAngle2 = exitAngle2 + PI / 2;
  const entryTangentAngle2 = entryAngle2 - PI / 2;

  // Calculate segment length and use it to determine control point distance
  const segmentLength2 = Math.abs(entryY2 - exitY2);

  // For the left side, use the same approach as the right side

  // 1. First, calculate the middle point of the vertical segment
  const midX2 = (exitX2 + entryX2) / 2;
  const midY2 = (exitY2 + entryY2) / 2;

  // 2. Calculate how much the midpoint should be offset inward (positive X = right)
  // Use same approach as the right side to reduce pinching when circles move outward
  // Calculate the horizontal distance between circles (increases as circles move out)
  const circleDistance2 = Math.abs(cornerAnchors[3][0] - cornerAnchors[0][0]);
  // Base offset on both radius and position of circles - decreases as circles move outward
  const midPointOffset2 = r * 0.3 * (1 - t * 0.25); // Reduce pinching as t increases

  // 3. Calculate magic constant for circle curvature
  // Use same kappa value for consistency

  // Calculate first control point - positioned to match circle curvature
  const tan1Length2 = r * kappa; // This precisely matches a circle's curvature
  const ctrl1X2 = exitX2 + Math.cos(exitTangentAngle2) * tan1Length2;
  const ctrl1Y2 = exitY2 + Math.sin(exitTangentAngle2) * tan1Length2;

  // Calculate middle point with offset
  const midPointX2 = midX2 + midPointOffset2;

  // Slight adjustment for smooth transition
  const midControlX2 = midPointX2 - midPointOffset2 * 0.2;

  // Calculate the handle length for the middle point
  // Use same approach as right side for consistency
  const midHandleLength2 = segmentLength2 * 0.25; // 25% of segment length

  // First curve: from exit to middle (bottom to middle)
  // Use perfectly vertical handle at midpoint
  context.bezierCurveTo(
    ctrl1X2,
    ctrl1Y2,
    midPointX2, // Keep X aligned with midpoint for vertical handle
    midY2 + midHandleLength2, // Handle extends directly downward
    midPointX2,
    midY2
  );

  // Calculate control points for top half
  const tan2Length2 = r * kappa;
  const ctrl2X2 = entryX2 + Math.cos(entryTangentAngle2) * tan2Length2;
  const ctrl2Y2 = entryY2 + Math.sin(entryTangentAngle2) * tan2Length2;

  // Second curve: from middle to entry (middle to top)
  // Use perfectly vertical handle at midpoint
  context.bezierCurveTo(
    midPointX2, // Keep X aligned with midpoint for vertical handle
    midY2 - midHandleLength2, // Handle extends directly upward
    ctrl2X2,
    ctrl2Y2,
    entryX2,
    entryY2
  );

  context.stroke();
  context.fill();

  // Draw the rings
  context.fillStyle = ring;
  context.strokeStyle = ring;
  cornerAnchors.forEach((anchor) => {
    context.beginPath();
    context.arc(...anchor, r / 2, 0, 2 * PI);
    context.stroke();
    context.fill();
  });

  // Draw the inner circles
  context.fillStyle = inner;
  context.strokeStyle = inner;
  cornerAnchors.forEach((anchor) => {
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
