import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { setupPenplotExport } from '../../penplot/render-penplot';
import { getDimensionsFromPreset } from '../../penplot/distances';
import { createNaleeSystem } from '../nalee/nalee-system';
import { makeDomain } from '../nalee/domain';
import type { Config, Walker } from '../nalee/types';

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

const seed = Random.getSeed();

const units = 'cm';
const [physicalWidth, physicalHeight] = getDimensionsFromPreset('a4', units);

const config = {
  cols: 20,
  rows: 20,
  walkerCount: 8,
  tileSize: 16,
  cameraAngle: 45,
  pathHeight: 34,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'cols', { min: 4, max: 40, step: 2 });
pane.addBinding(config, 'rows', { min: 4, max: 40, step: 2 });
pane.addBinding(config, 'walkerCount', { min: 1, max: 20, step: 1 });
pane.addBinding(config, 'tileSize', { min: 8, max: 60, step: 1 });
pane.addBinding(config, 'cameraAngle', { min: 0, max: 90, step: 1 });
pane.addBinding(config, 'pathHeight', { min: 1, max: 40, step: 1 });

function buildScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): { h: Heerich; faces: Face[] } {
  // Re-seed so layout stays consistent while tweaking other params
  Random.setSeed(seed);

  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'isometric', angle: config.cameraAngle },
  });
  const placed = new Set<string>();

  const plotterStyle = { stroke: 'black', strokeWidth: 0.03 };
  const style = {
    default: plotterStyle,
    top: { ...plotterStyle, hatch: { angle: 45, period: 8 } },
    left: { ...plotterStyle, hatch: { angle: 90, period: 5 } },
    right: { ...plotterStyle, hatch: { angle: 0, period: 5 } },
    front: { ...plotterStyle, hatch: { angle: 90, period: 5 } },
    back: { ...plotterStyle, hatch: { angle: 0, period: 5 } },
    bottom: plotterStyle,
  };

  const voxelStyle = (
    _ctx: CanvasRenderingContext2D,
    _walker: Walker,
    pts: Point[],
    _playhead: number,
  ) => {
    const placeVoxel = (px: number, pz: number) => {
      const key = `${px},${pz}`;
      if (placed.has(key)) return;
      placed.add(key);
      h.applyGeometry({
        type: 'box',
        position: [px, 0, pz],
        size: [1, config.pathHeight, 1],
        style,
      });
    };

    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      placeVoxel(x * 2, y * 2);
      if (i + 1 < pts.length) {
        const [nx, ny] = pts[i + 1];
        placeVoxel(x * 2 + (nx - x), y * 2 + (ny - y));
      }
    }
  };

  const domainToWorld = (x: number, y: number): Point => [x, y];

  const naleeConfig = {
    resolution: [config.cols, config.rows],
    size: 1,
    stepSize: 0.33,
    walkerCount: config.walkerCount,
    padding: 0,
    flat: true,
    pathStyle: voxelStyle,
  } satisfies Config;

  const domain = makeDomain(naleeConfig.resolution, domainToWorld);
  const naleeRender = createNaleeSystem(
    domain,
    naleeConfig,
    domainToWorld,
    [],
    'white',
  );
  naleeRender({ context, playhead: 0, width, height } as SketchProps);

  return { h, faces: h.getFaces() as Face[] };
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
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.stroke();
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
      if (d[i] < minX) minX = d[i];
      if (d[i + 1] < minY) minY = d[i + 1];
      if (d[i] > maxX) maxX = d[i];
      if (d[i + 1] > maxY) maxY = d[i + 1];
    }
  }
  return { minX, minY, maxX, maxY };
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
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'black';
    context.lineWidth = 1;

    const { h, faces } = buildScene(context, width, height);

    const { minX, minY, maxX, maxY } = sceneBounds(faces);
    const ox = (width - (maxX - minX)) / 2 - minX;
    const oy = (height - (maxY - minY)) / 2 - minY;

    drawFaces(context, faces, ox, oy);

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
