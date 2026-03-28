import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import { Pane } from 'tweakpane';

const config = {
  tileW: 40,
  tileH: 40,
  cameraAngle: 45,
  cameraDistance: 15,
  houseW: 5,
  houseH: 4,
  houseD: 5,
  wallFill: '#e8d4b8',
  roofFill: '#c94c3a',
  strokeColor: '#333333',
  bg: '#ffffff',
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

const cameraFolder = pane.addFolder({ title: 'Camera' });
cameraFolder.addBinding(config, 'tileW', { min: 10, max: 80, step: 1 });
cameraFolder.addBinding(config, 'tileH', { min: 10, max: 80, step: 1 });
cameraFolder.addBinding(config, 'cameraAngle', { min: 0, max: 90, step: 1 });
cameraFolder.addBinding(config, 'cameraDistance', { min: 1, max: 40, step: 1 });

const houseFolder = pane.addFolder({ title: 'House' });
houseFolder.addBinding(config, 'houseW', { min: 1, max: 15, step: 1 });
houseFolder.addBinding(config, 'houseH', { min: 1, max: 15, step: 1 });
houseFolder.addBinding(config, 'houseD', { min: 1, max: 15, step: 1 });

const colorFolder = pane.addFolder({ title: 'Colors' });
colorFolder.addBinding(config, 'wallFill');
colorFolder.addBinding(config, 'roofFill');
colorFolder.addBinding(config, 'strokeColor');
colorFolder.addBinding(config, 'bg');

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

function buildScene(): Face[] {
  const h = new Heerich({
    tile: [config.tileW, config.tileH],
    camera: {
      type: 'oblique',
      angle: config.cameraAngle,
      distance: config.cameraDistance,
    },
  });

  h.addBox({
    position: [0, 0, 0],
    size: [config.houseW, config.houseH, config.houseD],
    style: {
      default: { fill: config.wallFill, stroke: config.strokeColor },
      top: { fill: config.roofFill },
    },
  });

  const doorX = Math.floor(config.houseW / 2);
  const doorH = Math.min(3, config.houseH);
  h.removeBox({ position: [doorX, 1, 0], size: [1, doorH, 1] });

  return h.getFaces() as Face[];
}

function drawFaces(
  context: CanvasRenderingContext2D,
  faces: Face[],
  offsetX: number,
  offsetY: number
) {
  for (const face of faces) {
    if (face.type === 'content' || face.points.length === 0) continue;

    context.beginPath();
    context.moveTo(
      face.points[0][0] + offsetX,
      face.points[0][1] + offsetY
    );
    for (let i = 1; i < face.points.length; i++) {
      context.lineTo(
        face.points[i][0] + offsetX,
        face.points[i][1] + offsetY
      );
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

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    const faces = buildScene();

    // Center the scene
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
  duration: 4000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
