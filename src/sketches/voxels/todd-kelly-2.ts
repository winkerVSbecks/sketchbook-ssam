import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

Random.setSeed(Random.getRandomSeed());
const direction = Random.pick(['horizontal', 'vertical', 'diagonal'] as const);
console.log({ direction });

interface Face {
  type: string;
  points: [number, number][];
  depth: number;
  style: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  };
}

// Todd Kelly palette: warm oranges/pinks with blue/green accents
const COLORS = [
  '#d4842a', // orange
  '#e8a855', // light orange
  '#d4a87a', // tan
  '#e8b4c8', // pink
  '#c8a44a', // gold
  '#2d6eb5', // blue
  '#1a3d7a', // dark navy
  '#2d8a5a', // green
];

const config = {
  projection: 'oblique' as 'oblique' | 'perspective',
  cameraAngle: 45,
  cameraDistance: 6,
  tileSize: 20,
  cols: 30,
  rows: 30,
  diamondSize: 10,
  strokeWidth: 0.3,
  strokeColor: '#555555',
  bg: '#333333',
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'projection', {
  options: { oblique: 'oblique', perspective: 'perspective' },
});
pane.addBinding(config, 'cameraAngle', { min: 0, max: 360, step: 1 });
pane.addBinding(config, 'cameraDistance', { min: 1, max: 40, step: 1 });
pane.addBinding(config, 'tileSize', { min: 2, max: 30, step: 1 });
pane.addBinding(config, 'cols', { min: 10, max: 120, step: 1 });
pane.addBinding(config, 'rows', { min: 10, max: 120, step: 1 });
pane.addBinding(config, 'diamondSize', { min: 3, max: 30, step: 1 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 2, step: 0.05 });
pane.addBinding(config, 'strokeColor');
pane.addBinding(config, 'bg');

function buildScene(playhead: number): Face[] {
  const cameraOpts =
    config.projection === 'oblique'
      ? {
          type: 'oblique' as const,
          angle: config.cameraAngle,
          distance: config.cameraDistance,
        }
      : {
          type: 'perspective' as const,
          position: [
            Math.floor(config.cols / 2),
            Math.floor(config.rows / 2),
          ] as [number, number],
          distance: config.cameraDistance,
        };

  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: cameraOpts,
  });

  const cols = config.cols;
  const rows = config.rows;
  const phase = playhead * Math.PI * 2;
  const numColors = COLORS.length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = config.diamondSize;
      const offset = playhead * s;
      const shiftedC = c + (direction !== 'vertical' ? offset : 0);
      const shiftedR = r + (direction !== 'horizontal' ? offset : 0);
      const cx = Math.round(shiftedC / s) * s;
      const cy = Math.round(shiftedR / s) * s;
      const dist = Math.round(Math.abs(shiftedC - cx) + Math.abs(shiftedR - cy));

      const idx = ((dist % numColors) + numColors) % numColors;
      const color = COLORS[idx];

      // Height based on distance from diamond center — center is tallest
      const maxDist = Math.floor(s / 2);
      const depth = Math.max(1, maxDist - dist + 1);

      h.addBox({
        position: [c, -(depth - 1), r],
        size: [1, depth, 1],
        style: {
          default: {
            fill: color,
            stroke: config.strokeColor,
            strokeWidth: config.strokeWidth,
          },
        },
      });
    }
  }

  return h.getFaces() as Face[];
}

function drawFaces(
  context: CanvasRenderingContext2D,
  faces: Face[],
  offsetX: number,
  offsetY: number,
) {
  for (const face of faces) {
    if (face.type === 'content' || face.points.length === 0) continue;

    context.beginPath();
    context.moveTo(face.points[0][0] + offsetX, face.points[0][1] + offsetY);
    for (let i = 1; i < face.points.length; i++) {
      context.lineTo(face.points[i][0] + offsetX, face.points[i][1] + offsetY);
    }
    context.closePath();

    if (face.style.fill) {
      context.fillStyle = face.style.fill;
      context.fill();
    }
    if (face.style.stroke) {
      context.strokeStyle = face.style.stroke;
      context.lineWidth = face.style.strokeWidth || 1;
      context.stroke();
    }
  }
}

function computeBounds(faces: Face[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const face of faces) {
    for (const [px, py] of face.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  return { minX, minY, maxX, maxY };
}

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    const faces = buildScene(playhead);
    const { minX, minY, maxX, maxY } = computeBounds(faces);
    const sceneW = maxX - minX;
    const sceneH = maxY - minY;
    const offsetX = (width - sceneW) / 2 - minX;
    const offsetY = (height - sceneH) / 2 - minY;

    drawFaces(context, faces, offsetX, offsetY);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
