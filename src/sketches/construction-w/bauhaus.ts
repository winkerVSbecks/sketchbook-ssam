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

  // Check if two grid rectangles overlap
  const shapesOverlap = (
    a: { gridX: number; gridY: number; gridW: number; gridH: number },
    b: { gridX: number; gridY: number; gridW: number; gridH: number },
  ): boolean => {
    return (
      a.gridX < b.gridX + b.gridW &&
      a.gridX + a.gridW > b.gridX &&
      a.gridY < b.gridY + b.gridH &&
      a.gridY + a.gridH > b.gridY
    );
  };

  // Get a color that doesn't overlap with existing shapes
  const getNonOverlappingColor = (
    newShape: { gridX: number; gridY: number; gridW: number; gridH: number },
    existingElements: BauhausElement[],
  ): string => {
    const overlappingColors = existingElements
      .filter((el) => el.type !== 'line' && shapesOverlap(newShape, el))
      .map((el) => el.color);

    const availableColors = primaryColors.filter(
      (c) => !overlappingColors.includes(c),
    );

    return availableColors.length > 0
      ? Random.pick(availableColors)
      : Random.pick(primaryColors);
  };

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

    const shapeA = {
      gridX: Math.max(0, anchorXA),
      gridY: Math.max(0, anchorYA),
      gridW: anchorSizeA,
      gridH: anchorSizeA,
    };

    elements.push({
      type: shapeTypeA,
      ...shapeA,
      color: getNonOverlappingColor(shapeA, elements),
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

    const shapeB = {
      gridX: anchorXB,
      gridY: anchorYB,
      gridW: anchorSizeB,
      gridH: anchorSizeB,
    };

    elements.push({
      type: shapeTypeB,
      ...shapeB,
      color: getNonOverlappingColor(shapeB, elements),
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

    const accentShape = {
      gridX: accX,
      gridY: accY,
      gridW: 1,
      gridH: 1,
    };

    elements.push({
      type: accentType,
      ...accentShape,
      color: getNonOverlappingColor(accentShape, elements),
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
      const semiShape = {
        gridX: semiX,
        gridY: semiY,
        gridW: size,
        gridH: size,
      };

      elements.push({
        type: 'semicircle',
        ...semiShape,
        color: getNonOverlappingColor(semiShape, elements),
        rotation: onSideA ? rotationFacingLineA : rotationFacingLineB,
        filled: true,
        lineWidth: 0,
      });
    }
  }

  // Build occupancy grid to find negative space
  const occupancy: boolean[][] = Array.from({ length: config.rows }, () =>
    Array.from({ length: config.cols }, () => false),
  );

  // Mark cells adjacent to the structural line as occupied
  if (isVerticalLine) {
    // Vertical line is in gap before column lineGapIndex
    // Mark columns on both sides of the gap
    for (let row = 0; row < config.rows; row++) {
      if (lineGapIndex - 1 >= 0) occupancy[row][lineGapIndex - 1] = true;
      if (lineGapIndex < config.cols) occupancy[row][lineGapIndex] = true;
    }
  } else {
    // Horizontal line is in gap before row lineGapIndex
    // Mark rows on both sides of the gap
    for (let col = 0; col < config.cols; col++) {
      if (lineGapIndex - 1 >= 0) occupancy[lineGapIndex - 1][col] = true;
      if (lineGapIndex < config.rows) occupancy[lineGapIndex][col] = true;
    }
  }

  // Mark cells occupied by shapes
  elements.forEach((el) => {
    if (el.type === 'line') return;
    for (let row = el.gridY; row < el.gridY + el.gridH && row < config.rows; row++) {
      for (let col = el.gridX; col < el.gridX + el.gridW && col < config.cols; col++) {
        if (row >= 0 && col >= 0) {
          occupancy[row][col] = true;
        }
      }
    }
  });

  // Find best strip for text (1 cell wide, 3-4 cells long)
  type TextPlacement = {
    gridX: number;
    gridY: number;
    length: number;
    isVertical: boolean;
  } | null;

  let textPlacement: TextPlacement = null;

  // Check horizontal strips
  for (let row = 0; row < config.rows; row++) {
    let startCol = -1;
    let runLength = 0;

    for (let col = 0; col <= config.cols; col++) {
      const isEmpty = col < config.cols && !occupancy[row][col];

      if (isEmpty) {
        if (startCol === -1) startCol = col;
        runLength++;
      } else {
        if (runLength >= 3) {
          const length = Math.min(runLength, 4);
          if (!textPlacement || length > textPlacement.length) {
            textPlacement = {
              gridX: startCol,
              gridY: row,
              length,
              isVertical: false,
            };
          }
        }
        startCol = -1;
        runLength = 0;
      }
    }
  }

  // Check vertical strips
  for (let col = 0; col < config.cols; col++) {
    let startRow = -1;
    let runLength = 0;

    for (let row = 0; row <= config.rows; row++) {
      const isEmpty = row < config.rows && !occupancy[row][col];

      if (isEmpty) {
        if (startRow === -1) startRow = row;
        runLength++;
      } else {
        if (runLength >= 3) {
          const length = Math.min(runLength, 4);
          if (!textPlacement || length > textPlacement.length) {
            textPlacement = {
              gridX: col,
              gridY: startRow,
              length,
              isVertical: true,
            };
          }
        }
        startRow = -1;
        runLength = 0;
      }
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

    // Draw "BAUHAUS" text in negative space
    if (textPlacement) {
      const textRect = getRect(
        {
          width,
          height,
          cols: config.cols,
          rows: config.rows,
          gapX: config.gap[0],
          gapY: config.gap[1],
        },
        {
          x: textPlacement.gridX,
          y: textPlacement.gridY,
          w: textPlacement.isVertical ? 1 : textPlacement.length,
          h: textPlacement.isVertical ? textPlacement.length : 1,
        },
      );

      context.save();
      context.fillStyle = BAUHAUS_COLORS.black;
      context.textBaseline = 'middle';
      context.textAlign = 'center';

      if (textPlacement.isVertical) {
        // Vertical text
        context.translate(textRect.x + textRect.w / 2, textRect.y + textRect.h / 2);
        context.rotate(-Math.PI / 2);
        const fontSize = Math.min(textRect.w * 0.9, textRect.h / 7);
        context.font = `bold ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
        context.fillText('BAUHAUS', 0, 0);
      } else {
        // Horizontal text
        const fontSize = Math.min(textRect.h * 0.8, textRect.w / 7);
        context.font = `bold ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
        context.fillText(
          'BAUHAUS',
          textRect.x + textRect.w / 2,
          textRect.y + textRect.h / 2,
        );
      }
      context.restore();
    }

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
