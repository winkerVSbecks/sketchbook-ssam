import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../colors';

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

const palette = Random.shuffle(randomPalette());
const [bg, shade, face, top] = palette;

const config = {
  res: 40,
  count: 8,
  tileSize: 16,
  angle: 35,
  dist: 3,
  sw: 0.4,
  sc: 'rgba(0,0,0,0.15)',
  bg,
  face,
  top,
  shade,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'res', { min: 8, max: 40, step: 2 });
pane.addBinding(config, 'count', { min: 2, max: 10, step: 1 });
pane.addBinding(config, 'tileSize', { min: 8, max: 60, step: 1 });
pane.addBinding(config, 'angle', { min: 0, max: 90, step: 1 });
pane.addBinding(config, 'dist', { min: 1, max: 20, step: 0.5 });
pane.addBinding(config, 'sw', { min: 0, max: 2, step: 0.1 });
pane.addBinding(config, 'sc');

function buildScene(): Face[] {
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'oblique', angle: config.angle, distance: config.dist },
  });

  const period = config.res / config.count;
  const strokeStyle = { stroke: config.bg, strokeWidth: config.sw };
  const style = {
    default: { fill: config.face, ...strokeStyle },
    front: { fill: config.face, ...strokeStyle },
    back: { fill: config.face, ...strokeStyle },
    top: { fill: config.top, ...strokeStyle },
    left: { fill: config.shade, ...strokeStyle },
    right: { fill: config.shade, ...strokeStyle },
    bottom: { fill: config.shade, ...strokeStyle },
  };

  // Add a back wall of height maxH to hide the faces of boxes at the back of the scene
  h.applyGeometry({
    type: 'box',
    position: [0, 0, 0],
    size: [config.res, config.res, 1],
    style,
  });

  for (let y = 0; y < config.count; y++) {
    const yShift = y % 2 === 1 ? period : 0;
    for (let x = 0; x < config.count; x++) {
      if (x % 2 === 0) {
        for (let i = 0; i < period; i++) {
          h.applyGeometry({
            type: 'box',
            position: [
              (x * period + i + yShift) % config.res,
              y * period + period - i - 1,
              -1 - y,
            ],
            size: [period - i, 1, 1 + y],
            style,
          });
        }
      } else {
        for (let i = 0; i < period; i++) {
          h.applyGeometry({
            type: 'box',
            position: [
              (x * period + yShift) % config.res,
              y * period + period - i - 1,
              -1 - y,
            ],
            size: [period - i, 1, 1 + y],
            style,
          });
        }
      }
    }
  }

  return h.getFaces() as Face[];
}

function drawFaces(
  ctx: CanvasRenderingContext2D,
  faces: Face[],
  ox: number,
  oy: number,
) {
  for (const face of faces) {
    if (face.type === 'content') continue;

    const d = face.points.data;
    ctx.beginPath();
    ctx.moveTo(d[0] + ox, d[1] + oy);
    ctx.lineTo(d[2] + ox, d[3] + oy);
    ctx.lineTo(d[4] + ox, d[5] + oy);
    ctx.lineTo(d[6] + ox, d[7] + oy);
    ctx.closePath();

    if (face.style.fill) {
      ctx.fillStyle = face.style.fill;
      ctx.fill();
    }
    if (face.style.stroke) {
      ctx.strokeStyle = face.style.stroke;
      ctx.lineWidth = face.style.strokeWidth ?? 1;
      ctx.stroke();
    }
  }
}

function sceneBounds(faces: Face[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const face of faces) {
    if (face.type === 'content') continue;

    const d = face.points.data;
    for (let i = 0; i < d.length; i += 2) {
      const px = d[i],
        py = d[i + 1];
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

    const faces = buildScene();

    const { minX, minY, maxX, maxY } = sceneBounds(faces);
    const ox = (width - (maxX - minX)) / 2 - minX;
    const oy = (height - (maxY - minY)) / 2 - minY;

    drawFaces(context, faces, ox, oy);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 2000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
