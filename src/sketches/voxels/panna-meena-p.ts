import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { setupPenplotExport } from '../../penplot/render-penplot';
import { getDimensionsFromPreset } from '../../penplot/distances';

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

const units = 'cm';
const [physicalWidth, physicalHeight] = getDimensionsFromPreset('a4', units);

const config = {
  res: 40,
  count: 8,
  tileSize: 16,
  angle: 35,
  dist: 3,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'res', { min: 8, max: 40, step: 2 });
pane.addBinding(config, 'count', { min: 2, max: 10, step: 1 });
pane.addBinding(config, 'tileSize', { min: 8, max: 60, step: 1 });
pane.addBinding(config, 'angle', { min: 0, max: 90, step: 1 });
pane.addBinding(config, 'dist', { min: 1, max: 20, step: 0.5 });

function buildScene(): { h: Heerich; faces: Face[] } {
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'oblique', angle: config.angle, distance: config.dist },
  });

  const period = config.res / config.count;
  const style = { stroke: 'black', strokeWidth: 0.03 };
  const styleObj = {
    default: style,
    front: style,
    back: style,
    top: style,
    left: style,
    right: style,
    bottom: style,
  };

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
            style: styleObj,
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
            style: styleObj,
          });
        }
      }
    }
  }

  return { h, faces: h.getFaces() as Face[] };
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

function drawFaces(
  context: CanvasRenderingContext2D,
  faces: Face[],
  offsetX: number,
  offsetY: number,
) {
  for (const face of faces) {
    if (face.type === 'content') continue;
    const d = face.points.data;
    context.beginPath();
    context.moveTo(d[0] + offsetX, d[1] + offsetY);
    context.lineTo(d[2] + offsetX, d[3] + offsetY);
    context.lineTo(d[4] + offsetX, d[5] + offsetY);
    context.lineTo(d[6] + offsetX, d[7] + offsetY);
    context.closePath();
    context.fillStyle = 'white';
    context.fill();
    context.stroke();
  }
}

function buildSvg(h: Heerich): string {
  const bounds = h.getBounds();
  const sceneW = bounds.w;
  const sceneH = bounds.h;

  const margin = 1; // cm
  const availW = physicalWidth - margin * 2;
  const availH = physicalHeight - margin * 2;
  const scale = Math.min(availW / sceneW, availH / sceneH);

  const vbX = bounds.x - (physicalWidth / scale - sceneW) / 2;
  const vbY = bounds.y - (physicalHeight / scale - sceneH) / 2;
  const vbW = physicalWidth / scale;
  const vbH = physicalHeight / scale;

  const faces = h.getFaces() as Face[];
  for (const face of faces) {
    if (face.type === 'content') continue;
    face.style = {
      fill: 'white',
      stroke: 'black',
      strokeWidth: 0.5,
    };
  }

  const svg = h.toSVG({
    // faces,
    padding: 0,
    viewBox: [vbX, vbY, vbW, vbH],
    occlusion: true,
  });

  return svg.replace(
    'style="width:100%; height:100%;"',
    `width="${physicalWidth}${units}" height="${physicalHeight}${units}"`,
  );
}

export const sketch = ({ wrap, context }: SketchProps) => {
  let latestSvg: string | null = null;
  const cleanupExport = setupPenplotExport(settings, () => latestSvg);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanupExport();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    const { h, faces } = buildScene();

    const { minX, minY, maxX, maxY } = sceneBounds(faces);
    const offsetX = (width - (maxX - minX)) / 2 - minX;
    const offsetY = (height - (maxY - minY)) / 2 - minY;

    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'black';
    context.lineWidth = 1;
    drawFaces(context, faces, offsetX, offsetY);

    latestSvg = buildSvg(h);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, Math.round(1080 * (physicalHeight / physicalWidth))],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);
