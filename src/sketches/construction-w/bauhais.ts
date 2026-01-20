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
  gap: [10, 10] as [number, number],
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

  const primaryColors = [
    BAUHAUS_COLORS.red,
    BAUHAUS_COLORS.yellow,
    BAUHAUS_COLORS.blue,
  ];
  const allColors = [
    ...primaryColors,
    BAUHAUS_COLORS.black,
    BAUHAUS_COLORS.orange,
  ];

  // Only 90-degree rotations to maintain grid alignment
  const rotations = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  // Generate Bauhaus elements with deliberate composition
  const elements: BauhausElement[] = [];

  // Layer 1: Large primary shape (anchor element)
  const anchorSize = Random.rangeFloor(3, 5);
  const anchorX = Random.rangeFloor(0, config.cols - anchorSize + 1);
  const anchorY = Random.rangeFloor(0, config.rows - anchorSize + 1);
  elements.push({
    type: Random.pick(['circle', 'rectangle', 'quarterCircle']),
    gridX: anchorX,
    gridY: anchorY,
    gridW: anchorSize,
    gridH: anchorSize,
    color: Random.pick(primaryColors),
    rotation: Random.pick(rotations),
    filled: true,
    lineWidth: 0,
  });

  // Layer 2: Secondary shape (contrasting position)
  const secondarySize = Random.rangeFloor(2, 4);
  // Position away from anchor
  const secondaryX =
    anchorX < config.cols / 2
      ? Random.rangeFloor(
          Math.min(anchorX + anchorSize, config.cols - secondarySize),
          config.cols - secondarySize + 1,
        )
      : Random.rangeFloor(0, Math.max(1, anchorX - secondarySize + 1));
  const secondaryY =
    anchorY < config.rows / 2
      ? Random.rangeFloor(
          Math.min(anchorY + anchorSize, config.rows - secondarySize),
          config.rows - secondarySize + 1,
        )
      : Random.rangeFloor(0, Math.max(1, anchorY - secondarySize + 1));
  elements.push({
    type: Random.pick(['circle', 'triangle', 'semicircle']),
    gridX: secondaryX,
    gridY: secondaryY,
    gridW: secondarySize,
    gridH: secondarySize,
    color: Random.pick(primaryColors.filter((c) => c !== elements[0].color)),
    rotation: Random.pick(rotations),
    filled: true,
    lineWidth: 0,
  });

  // Layer 3: Accent rectangles (always axis-aligned, no rotation)
  const accentCount = Random.rangeFloor(1, 3);
  for (let i = 0; i < accentCount; i++) {
    const isHorizontal = Random.chance(0.5);
    const w = isHorizontal ? Random.rangeFloor(2, 4) : 1;
    const h = isHorizontal ? 1 : Random.rangeFloor(2, 4);
    elements.push({
      type: 'rectangle',
      gridX: Random.rangeFloor(0, config.cols - w + 1),
      gridY: Random.rangeFloor(0, config.rows - h + 1),
      gridW: w,
      gridH: h,
      color: Random.pick([BAUHAUS_COLORS.black, ...primaryColors]),
      rotation: 0, // No rotation for rectangles
      filled: true,
      lineWidth: 0,
    });
  }

  // Layer 4: Small geometric accents
  const smallAccentCount = Random.rangeFloor(2, 4);
  for (let i = 0; i < smallAccentCount; i++) {
    elements.push({
      type: Random.pick(['circle', 'triangle', 'semicircle']),
      gridX: Random.rangeFloor(0, config.cols - 1),
      gridY: Random.rangeFloor(0, config.rows - 1),
      gridW: 1,
      gridH: 1,
      color: Random.pick(allColors),
      rotation: Random.pick(rotations),
      filled: Random.chance(0.7),
      lineWidth: 4,
    });
  }

  // Layer 5: Structural lines (strictly horizontal or vertical)
  const lineCount = Random.rangeFloor(1, 3);
  for (let i = 0; i < lineCount; i++) {
    const isVertical = Random.chance(0.5);
    const lineX = Random.rangeFloor(0, config.cols);
    const lineY = Random.rangeFloor(0, config.rows);
    elements.push({
      type: 'line',
      gridX: isVertical ? lineX : 0,
      gridY: isVertical ? 0 : lineY,
      gridW: isVertical ? 0 : config.cols,
      gridH: isVertical ? config.rows : 0,
      color: BAUHAUS_COLORS.black,
      rotation: isVertical ? Math.PI / 2 : 0,
      filled: false,
      lineWidth: Random.pick([4, 8, 12]),
    });
  }

  // Layer 6: Optional concentric arcs (centered on grid intersection)
  if (Random.chance(0.5)) {
    const cx = Random.rangeFloor(1, config.cols - 1);
    const cy = Random.rangeFloor(1, config.rows - 1);
    const arcRotation = Random.pick(rotations);

    for (let i = 0; i < 3; i++) {
      const size = 1 + i;
      if (cx - Math.floor(size / 2) >= 0 && cy - Math.floor(size / 2) >= 0) {
        elements.push({
          type: 'arc',
          gridX: cx - Math.floor(size / 2),
          gridY: cy - Math.floor(size / 2),
          gridW: size,
          gridH: size,
          color: i === 0 ? BAUHAUS_COLORS.black : Random.pick(primaryColors),
          rotation: arcRotation, // Same rotation for all arcs in set
          filled: false,
          lineWidth: 3,
        });
      }
    }
  }

  wrap.render = () => {
    // Cream/off-white background typical of Bauhaus posters
    context.fillStyle = BAUHAUS_COLORS.cream;
    context.fillRect(0, 0, width, height);

    // Draw elements
    elements.forEach((el) => {
      const rect = getRect(
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

      context.fillStyle = el.color;
      context.strokeStyle = el.color;

      switch (el.type) {
        case 'circle': {
          const radius = Math.min(rect.w, rect.h) / 2;
          context.beginPath();
          context.arc(
            rect.x + rect.w / 2,
            rect.y + rect.h / 2,
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
          drawSemicircle(context, rect.x, rect.y, rect.w, rect.h, el.rotation);
          if (el.filled) {
            context.fill();
          } else {
            context.lineWidth = el.lineWidth;
            context.stroke();
          }
          break;
        }
        case 'quarterCircle': {
          drawQuarterCircle(
            context,
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            el.rotation,
          );
          if (el.filled) {
            context.fill();
          } else {
            context.lineWidth = el.lineWidth;
            context.stroke();
          }
          break;
        }
        case 'triangle': {
          drawTriangle(context, rect.x, rect.y, rect.w, rect.h, el.rotation);
          if (el.filled) {
            context.fill();
          } else {
            context.lineWidth = el.lineWidth;
            context.stroke();
          }
          break;
        }
        case 'rectangle': {
          // Rectangles stay axis-aligned (no rotation)
          if (el.filled) {
            context.fillRect(rect.x, rect.y, rect.w, rect.h);
          } else {
            context.lineWidth = el.lineWidth;
            context.strokeRect(rect.x, rect.y, rect.w, rect.h);
          }
          break;
        }
        case 'line': {
          // Draw lines as simple horizontal or vertical strokes
          context.lineWidth = el.lineWidth;
          context.lineCap = 'square';
          context.beginPath();
          if (el.rotation === Math.PI / 2 || el.rotation === -Math.PI / 2) {
            // Vertical line
            const x = rect.x + rect.w / 2;
            context.moveTo(x, 0);
            context.lineTo(x, height);
          } else {
            // Horizontal line
            const y = rect.y + rect.h / 2;
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
