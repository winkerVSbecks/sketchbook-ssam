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
  gap: [0, 0] as [number, number],
  elementCount: 12,
};

type ShapeType = 'circle' | 'semicircle' | 'triangle' | 'rectangle' | 'line' | 'arc' | 'quarterCircle';

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
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI, false);
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
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.arc(-w / 2, -h / 2, radius, 0, Math.PI / 2, false);
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

const drawLine = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  lineWidth: number,
) => {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
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

  let showGrid = false;

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

  const shapeTypes: ShapeType[] = [
    'circle',
    'semicircle',
    'triangle',
    'rectangle',
    'line',
    'arc',
    'quarterCircle',
  ];

  const rotations = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 4, (3 * Math.PI) / 4];

  // Generate Bauhaus elements
  const elements: BauhausElement[] = [];

  // Add a large background shape
  const bgShape: BauhausElement = {
    type: Random.pick(['circle', 'rectangle', 'quarterCircle']),
    gridX: Random.rangeFloor(0, 2),
    gridY: Random.rangeFloor(0, 2),
    gridW: Random.rangeFloor(3, config.cols),
    gridH: Random.rangeFloor(3, config.rows),
    color: Random.pick(primaryColors),
    rotation: Random.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
    filled: true,
    lineWidth: 0,
  };
  elements.push(bgShape);

  // Generate random elements
  for (let i = 0; i < config.elementCount; i++) {
    const type = Random.pick(shapeTypes);
    const filled = type === 'line' || type === 'arc' ? false : Random.chance(0.7);
    const gridW = Random.rangeFloor(1, 4);
    const gridH = Random.rangeFloor(1, 4);

    const element: BauhausElement = {
      type,
      gridX: Random.rangeFloor(0, config.cols - gridW + 1),
      gridY: Random.rangeFloor(0, config.rows - gridH + 1),
      gridW,
      gridH,
      color: Random.pick(allColors),
      rotation: Random.pick(rotations),
      filled,
      lineWidth: Random.range(4, 16),
    };
    elements.push(element);
  }

  // Add some bold lines
  const lineCount = Random.rangeFloor(2, 5);
  for (let i = 0; i < lineCount; i++) {
    const isVertical = Random.chance(0.5);
    elements.push({
      type: 'line',
      gridX: Random.rangeFloor(0, config.cols - 1),
      gridY: Random.rangeFloor(0, config.rows - 1),
      gridW: isVertical ? 1 : Random.rangeFloor(2, config.cols),
      gridH: isVertical ? Random.rangeFloor(2, config.rows) : 1,
      color: BAUHAUS_COLORS.black,
      rotation: isVertical ? Math.PI / 2 : 0,
      filled: false,
      lineWidth: Random.range(6, 20),
    });
  }

  // Add concentric circles or arcs
  if (Random.chance(0.6)) {
    const cx = Random.rangeFloor(1, config.cols - 2);
    const cy = Random.rangeFloor(1, config.rows - 2);
    const concentricCount = Random.rangeFloor(2, 4);

    for (let i = 0; i < concentricCount; i++) {
      elements.push({
        type: 'arc',
        gridX: cx - i,
        gridY: cy - i,
        gridW: 2 + i * 2,
        gridH: 2 + i * 2,
        color: i === 0 ? BAUHAUS_COLORS.black : Random.pick(allColors),
        rotation: Random.pick(rotations),
        filled: false,
        lineWidth: Random.range(3, 8),
      });
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
          context.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, radius, 0, Math.PI * 2);
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
          drawQuarterCircle(context, rect.x, rect.y, rect.w, rect.h, el.rotation);
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
          context.save();
          context.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
          context.rotate(el.rotation);
          if (el.filled) {
            context.fillRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
          } else {
            context.lineWidth = el.lineWidth;
            context.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
          }
          context.restore();
          break;
        }
        case 'line': {
          drawLine(context, rect.x, rect.y, rect.w, rect.h, el.rotation, el.lineWidth);
          break;
        }
        case 'arc': {
          drawArc(context, rect.x, rect.y, rect.w, rect.h, el.rotation, el.lineWidth);
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
