import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { getRect, makeGrid } from '../../grid';

// Bauhaus color palette
const BAUHAUS_COLORS = {
  red: '#E53935',
  yellow: '#FDD835',
  blue: '#1E88E5',
  black: '#212121',
  cream: '#F5F5DC',
  orange: '#FF6F00',
  white: '#FFFFFF',
};

// Configuration
const config = {
  cols: 6,
  rows: 8,
  gap: [20, 20] as [number, number],
};

type ShapeType =
  | 'circle'
  | 'semicircle'
  | 'triangle'
  | 'rectangle'
  | 'line'
  | 'arc'
  | 'quarterCircle';

interface BauhausElement {
  type: ShapeType;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  color: string;
  rotation: number;
  filled: boolean;
  lineWidth: number;
}

const createToggleButton = (onToggle: () => void) => {
  const button = document.createElement('button');
  button.textContent = 'Toggle Grid';
  button.style.position = 'fixed';
  button.style.top = '20px';
  button.style.right = '20px';
  button.style.padding = '10px 20px';
  button.style.cursor = 'pointer';
  button.style.zIndex = '1000';
  button.style.fontFamily = 'sans-serif';
  button.style.fontSize = '14px';
  button.style.border = '2px solid #212121';
  button.style.background = '#fff';
  button.style.color = '#212121';
  button.style.borderRadius = '4px';
  button.addEventListener('click', onToggle);
  document.body.appendChild(button);
  return button;
};

const drawTriangle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
) => {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.restore();
};

const drawSemicircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
) => {
  const radius = Math.min(w, h) / 2;
  ctx.save();

  // Position semicircle at edge of bounding box based on rotation
  let cx = x + w / 2;
  let cy = y + h / 2;
  let startAngle = 0;
  let endAngle = Math.PI;

  if (rotation === 0) {
    // Flat edge at bottom
    cy = y + h;
    startAngle = Math.PI;
    endAngle = 2 * Math.PI;
  } else if (rotation === Math.PI / 2) {
    // Flat edge at left
    cx = x;
    startAngle = -Math.PI / 2;
    endAngle = Math.PI / 2;
  } else if (rotation === Math.PI || rotation === -Math.PI) {
    // Flat edge at top
    cy = y;
    startAngle = 0;
    endAngle = Math.PI;
  } else if (rotation === -Math.PI / 2) {
    // Flat edge at right
    cx = x + w;
    startAngle = Math.PI / 2;
    endAngle = (3 * Math.PI) / 2;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle, false);
  ctx.closePath();
  ctx.restore();
};

const drawQuarterCircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
) => {
  const radius = Math.min(w, h);
  ctx.save();
  ctx.translate(x, y);

  // Rotate around the corner that will be the arc center
  const corners = [
    { cx: 0, cy: 0, start: 0, end: Math.PI / 2 }, // top-left
    { cx: w, cy: 0, start: Math.PI / 2, end: Math.PI }, // top-right
    { cx: w, cy: h, start: Math.PI, end: (3 * Math.PI) / 2 }, // bottom-right
    { cx: 0, cy: h, start: (3 * Math.PI) / 2, end: 2 * Math.PI }, // bottom-left
  ];

  // Map rotation to corner index
  let cornerIndex = 0;
  if (rotation === Math.PI / 2) cornerIndex = 1;
  else if (rotation === Math.PI || rotation === -Math.PI) cornerIndex = 2;
  else if (rotation === -Math.PI / 2) cornerIndex = 3;

  const corner = corners[cornerIndex];
  ctx.beginPath();
  ctx.moveTo(corner.cx, corner.cy);
  ctx.arc(corner.cx, corner.cy, radius, corner.start, corner.end, false);
  ctx.closePath();
  ctx.restore();
};

const drawArc = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  lineWidth: number,
) => {
  const radius = Math.min(w, h) / 2;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI, false);
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
};

export const sketch = ({
  wrap,
  context,
  width,
  height,
  render,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  let showGrid = true;

  createToggleButton(() => {
    showGrid = !showGrid;
    render();
  });

  const grid = makeGrid({
    width,
    height,
    cols: config.cols,
    rows: config.rows,
    gapX: config.gap[0],
    gapY: config.gap[1],
  });

  // Bauhaus primary colors
  const primaryColors = [
    BAUHAUS_COLORS.red,
    BAUHAUS_COLORS.yellow,
    BAUHAUS_COLORS.blue,
  ];

  // Only 90-degree rotations to maintain grid alignment
  const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  // Generate Bauhaus elements with deliberate composition
  const elements: BauhausElement[] = [];

  // FOUNDATION: Structural line aligned to grid gap
  // This is the compositional anchor - everything else relates to it
  const isVerticalLine = Random.chance(0.5);
  // Pick a gap position (between cells, not at edges)
  const lineGapIndex = isVerticalLine
    ? Random.rangeFloor(1, config.cols - 1)
    : Random.rangeFloor(2, config.rows - 2);

  // Use actual grid cell positions to find the exact gap center
  // For vertical line: gap is before column lineGapIndex
  // For horizontal line: gap is before row lineGapIndex
  const linePixelPos = isVerticalLine
    ? grid[lineGapIndex].x - config.gap[0] / 2
    : grid[lineGapIndex * config.cols].y - config.gap[1] / 2;

  // Store line info for shape placement
  const structuralLine = {
    isVertical: isVerticalLine,
    gapIndex: lineGapIndex,
    pixelPos: linePixelPos,
    thickness: isVerticalLine ? config.gap[0] : config.gap[1],
  };

  // Add the structural line element (will be drawn specially)
  elements.push({
    type: 'line',
    gridX: isVerticalLine ? lineGapIndex : 0,
    gridY: isVerticalLine ? 0 : lineGapIndex,
    gridW: 0,
    gridH: 0,
    color: BAUHAUS_COLORS.black,
    rotation: isVerticalLine ? Math.PI / 2 : 0,
    filled: false,
    lineWidth: structuralLine.thickness,
  });

  // Rotation helpers: flat edge faces the line
  // For semicircle/triangle on Side A (left of vertical or above horizontal line)
  const rotationFacingLineA = isVerticalLine ? -Math.PI / 2 : 0;
  // For semicircle/triangle on Side B (right of vertical or below horizontal line)
  const rotationFacingLineB = isVerticalLine ? Math.PI / 2 : Math.PI;
  // For quarterCircle: corner should touch the line
  const quarterRotationA = isVerticalLine
    ? Random.pick([Math.PI / 2, -Math.PI / 2]) // corner on right
    : Random.pick([Math.PI, -Math.PI / 2]); // corner on bottom
  const quarterRotationB = isVerticalLine
    ? Random.pick([0, Math.PI]) // corner on left
    : Random.pick([0, Math.PI / 2]); // corner on top

  // SIDE A: Large primary shape touching the line
  const anchorSizeA = Math.min(
    Random.rangeFloor(2, 4),
    isVerticalLine ? lineGapIndex : lineGapIndex,
  );
  if (anchorSizeA >= 2) {
    const anchorXA = isVerticalLine
      ? lineGapIndex - anchorSizeA
      : Random.rangeFloor(0, config.cols - anchorSizeA + 1);
    const anchorYA = isVerticalLine
      ? Random.rangeFloor(0, config.rows - anchorSizeA + 1)
      : lineGapIndex - anchorSizeA;

    const shapeTypeA = Random.pick(['circle', 'rectangle', 'semicircle', 'triangle', 'quarterCircle'] as ShapeType[]);
    const rotationA =
      shapeTypeA === 'semicircle' || shapeTypeA === 'triangle'
        ? rotationFacingLineA
        : shapeTypeA === 'quarterCircle'
          ? quarterRotationA
          : 0;

    elements.push({
      type: shapeTypeA,
      gridX: Math.max(0, anchorXA),
      gridY: Math.max(0, anchorYA),
      gridW: anchorSizeA,
      gridH: anchorSizeA,
      color: Random.pick(primaryColors),
      rotation: rotationA,
      filled: true,
      lineWidth: 0,
    });
  }

  // SIDE B: Secondary shape touching the line from the other side
  const spaceB = isVerticalLine
    ? config.cols - lineGapIndex
    : config.rows - lineGapIndex;
  const anchorSizeB = Math.min(Random.rangeFloor(2, 4), spaceB);

  if (anchorSizeB >= 2) {
    const anchorXB = isVerticalLine
      ? lineGapIndex
      : Random.rangeFloor(0, config.cols - anchorSizeB + 1);
    const anchorYB = isVerticalLine
      ? Random.rangeFloor(0, config.rows - anchorSizeB + 1)
      : lineGapIndex;

    const shapeTypeB = Random.pick(['circle', 'triangle', 'semicircle', 'quarterCircle'] as ShapeType[]);
    const rotationB =
      shapeTypeB === 'semicircle' || shapeTypeB === 'triangle'
        ? rotationFacingLineB
        : shapeTypeB === 'quarterCircle'
          ? quarterRotationB
          : 0;

    elements.push({
      type: shapeTypeB,
      gridX: anchorXB,
      gridY: anchorYB,
      gridW: anchorSizeB,
      gridH: anchorSizeB,
      color: Random.pick(primaryColors),
      rotation: rotationB,
      filled: true,
      lineWidth: 0,
    });
  }

  // ACCENTS: Small shapes touching the line with correct orientation
  const accentCount = Random.rangeFloor(3, 6);
  for (let i = 0; i < accentCount; i++) {
    const onSideA = Random.chance(0.5);

    let accX: number, accY: number;
    if (isVerticalLine) {
      accX = onSideA ? lineGapIndex - 1 : lineGapIndex;
      accY = Random.rangeFloor(0, config.rows);
    } else {
      accX = Random.rangeFloor(0, config.cols);
      accY = onSideA ? lineGapIndex - 1 : lineGapIndex;
    }

    if (accX < 0 || accY < 0) continue;

    const accentType = Random.pick(['circle', 'triangle', 'semicircle', 'rectangle'] as ShapeType[]);
    const accentRotation =
      accentType === 'semicircle' || accentType === 'triangle'
        ? onSideA
          ? rotationFacingLineA
          : rotationFacingLineB
        : 0;

    elements.push({
      type: accentType,
      gridX: accX,
      gridY: accY,
      gridW: 1,
      gridH: 1,
      color: Random.pick(primaryColors),
      rotation: accentRotation,
      filled: Random.chance(0.8),
      lineWidth: 3,
    });
  }

  // OPTIONAL: Large semicircle with flat edge on the line
  if (Random.chance(0.5)) {
    const onSideA = Random.chance(0.5);
    const size = Random.rangeFloor(2, 4);

    const semiX = isVerticalLine
      ? onSideA
        ? lineGapIndex - size
        : lineGapIndex
      : Random.rangeFloor(0, config.cols - size + 1);
    const semiY = isVerticalLine
      ? Random.rangeFloor(0, config.rows - size + 1)
      : onSideA
        ? lineGapIndex - size
        : lineGapIndex;

    if (semiX >= 0 && semiY >= 0) {
      elements.push({
        type: 'semicircle',
        gridX: semiX,
        gridY: semiY,
        gridW: size,
        gridH: size,
        color: Random.pick(primaryColors),
        rotation: onSideA ? rotationFacingLineA : rotationFacingLineB,
        filled: true,
        lineWidth: 0,
      });
    }
  }

  wrap.render = () => {
    // Cream/off-white background typical of Bauhaus posters
    context.fillStyle = BAUHAUS_COLORS.cream;
    context.fillRect(0, 0, width, height);

    // Draw elements
    elements.forEach((el) => {
      const baseRect = getRect(
        {
          width,
          height,
          cols: config.cols,
          rows: config.rows,
          gapX: config.gap[0],
          gapY: config.gap[1],
        },
        { x: el.gridX, y: el.gridY, w: el.gridW, h: el.gridH },
      );

      // For stroked shapes, inset by half lineWidth so stroke aligns to grid
      const strokeInset = el.filled ? 0 : el.lineWidth / 2;
      const rect = {
        x: baseRect.x + strokeInset,
        y: baseRect.y + strokeInset,
        w: baseRect.w - el.lineWidth,
        h: baseRect.h - el.lineWidth,
      };

      context.fillStyle = el.color;
      context.strokeStyle = el.color;

      switch (el.type) {
        case 'circle': {
          const baseRadius = Math.min(baseRect.w, baseRect.h) / 2;
          const radius = el.filled ? baseRadius : baseRadius - strokeInset;
          context.beginPath();
          context.arc(
            baseRect.x + baseRect.w / 2,
            baseRect.y + baseRect.h / 2,
            radius,
            0,
            Math.PI * 2,
          );
          if (el.filled) {
            context.fill();
          } else {
            context.lineWidth = el.lineWidth;
            context.stroke();
          }
          break;
        }
        case 'semicircle': {
          if (el.filled) {
            drawSemicircle(context, baseRect.x, baseRect.y, baseRect.w, baseRect.h, el.rotation);
            context.fill();
          } else {
            drawSemicircle(context, rect.x, rect.y, rect.w, rect.h, el.rotation);
            context.lineWidth = el.lineWidth;
            context.stroke();
          }
          break;
        }
        case 'quarterCircle': {
          if (el.filled) {
            drawQuarterCircle(context, baseRect.x, baseRect.y, baseRect.w, baseRect.h, el.rotation);
            context.fill();
          } else {
            drawQuarterCircle(context, rect.x, rect.y, rect.w, rect.h, el.rotation);
            context.lineWidth = el.lineWidth;
            context.stroke();
          }
          break;
        }
        case 'triangle': {
          if (el.filled) {
            drawTriangle(context, baseRect.x, baseRect.y, baseRect.w, baseRect.h, el.rotation);
            context.fill();
          } else {
            drawTriangle(context, rect.x, rect.y, rect.w, rect.h, el.rotation);
            context.lineWidth = el.lineWidth;
            context.stroke();
          }
          break;
        }
        case 'rectangle': {
          // Rectangles stay axis-aligned (no rotation)
          if (el.filled) {
            context.fillRect(baseRect.x, baseRect.y, baseRect.w, baseRect.h);
          } else {
            context.lineWidth = el.lineWidth;
            context.strokeRect(rect.x, rect.y, rect.w, rect.h);
          }
          break;
        }
        case 'line': {
          // Draw structural line aligned precisely to the grid gap
          context.lineWidth = el.lineWidth;
          context.lineCap = 'butt';
          context.beginPath();
          if (el.rotation === Math.PI / 2 || el.rotation === -Math.PI / 2) {
            // Vertical line - position at gap center
            const x = structuralLine.pixelPos;
            context.moveTo(x, 0);
            context.lineTo(x, height);
          } else {
            // Horizontal line - position at gap center
            const y = structuralLine.pixelPos;
            context.moveTo(0, y);
            context.lineTo(width, y);
          }
          context.stroke();
          break;
        }
        case 'arc': {
          drawArc(
            context,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            el.rotation,
            el.lineWidth,
          );
          break;
        }
      }
    });

    // Draw grid overlay if enabled
    if (showGrid) {
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      grid.forEach((cell) => {
        context.strokeRect(cell.x, cell.y, cell.width, cell.height);
      });
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600, 800], // Portrait poster ratio
  pixelRatio: window.devicePixelRatio,
  animate: false,
  framesFormat: ['png'],
};

ssam(sketch as Sketch<'2d'>, settings);
