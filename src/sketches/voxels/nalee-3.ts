import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../colors';
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

const palette = randomPalette();
const bg = Random.pick(palette);
const seed = Random.getSeed();

const config = {
  // cols: 30,
  // rows: 30,
  // walkerCount: 1,
  // tileSize: 18,
  cols: 20,
  rows: 20,
  walkerCount: 1,
  tileSize: 16,
  cameraAngle: 45,
  pathHeightMin: 10,
  pathHeightMax: 50,
  flat: true,
  sw: 0.1,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'cols', { min: 4, max: 80, step: 2 });
pane.addBinding(config, 'rows', { min: 4, max: 80, step: 2 });
pane.addBinding(config, 'walkerCount', { min: 1, max: 20, step: 1 });
pane.addBinding(config, 'tileSize', { min: 8, max: 60, step: 1 });
pane.addBinding(config, 'cameraAngle', { min: 0, max: 90, step: 1 });
pane.addBinding(config, 'pathHeightMin', { min: 1, max: 60, step: 1 });
pane.addBinding(config, 'pathHeightMax', { min: 1, max: 80, step: 1 });
pane.addBinding(config, 'flat');
pane.addBinding(config, 'sw', { min: 0, max: 2, step: 0.1 });

function buildScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): Face[] {
  // Re-seed so layout stays consistent while tweaking other params
  Random.setSeed(seed);

  const heerich = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'isometric', angle: config.cameraAngle },
  });
  const placed = new Set<string>();

  const voxelStyle = (
    _ctx: CanvasRenderingContext2D,
    walker: Walker,
    pts: Point[],
    _playhead: number,
  ) => {
    const base = walker.color;
    const lighter = `oklch(from ${base} calc(l + 0.15) c h)`;
    const darker = `oklch(from ${base} calc(l - 0.15) c h)`;
    const style = {
      default: {
        fill: base,
        stroke: config.flat ? base : bg,
        strokeWidth: config.sw,
      },
      top: {
        fill: lighter,
        stroke: config.flat ? lighter : bg,
        strokeWidth: config.sw,
      },
      left: {
        fill: darker,
        stroke: config.flat ? darker : bg,
        strokeWidth: config.sw,
      },
      right: {
        fill: darker,
        stroke: config.flat ? darker : bg,
        strokeWidth: config.sw,
      },
      bottom: {
        fill: darker,
        stroke: config.flat ? darker : bg,
        strokeWidth: config.sw,
      },
      front: {
        fill: base,
        stroke: config.flat ? base : bg,
        strokeWidth: config.sw,
      },
      back: {
        fill: base,
        stroke: config.flat ? base : bg,
        strokeWidth: config.sw,
      },
    };

    const maxPathLength = config.cols * config.rows;
    const pathHeight = Math.round(
      mapRange(
        pts.length,
        1,
        maxPathLength,
        config.pathHeightMax,
        config.pathHeightMin,
      ),
    );

    const placeVoxel = (px: number, pz: number) => {
      const key = `${px},${pz}`;
      if (placed.has(key)) return;
      placed.add(key);
      heerich.applyGeometry({
        type: 'box',
        position: [px, config.pathHeightMax - pathHeight, pz],
        size: [1, pathHeight, 1],
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
    palette,
    bg,
  );
  naleeRender({ context, playhead: 0, width, height } as SketchProps);

  return heerich.getFaces() as Face[];
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
      if (d[i] < minX) minX = d[i];
      if (d[i + 1] < minY) minY = d[i + 1];
      if (d[i] > maxX) maxX = d[i];
      if (d[i + 1] > maxY) maxY = d[i + 1];
    }
  }
  return { minX, minY, maxX, maxY };
}

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const faces = buildScene(context, width, height);

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
};

ssam(sketch as Sketch<'2d'>, settings);
