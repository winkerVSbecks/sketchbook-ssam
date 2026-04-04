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
  points: [number, number][];
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

const palette = Random.shuffle(randomPalette());

const config = {
  layers: 6,
  tileSize: 32,
  angle: 45,
  dist: 3,
  sw: 0.4,
  sc: 'rgba(0,0,0,0.15)',
  bg: palette[0],
  colors: palette.slice(1),
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'layers', { min: 2, max: 12, step: 1 });
pane.addBinding(config, 'tileSize', { min: 8, max: 80, step: 1 });
pane.addBinding(config, 'angle', { min: 0, max: 90, step: 1 });
pane.addBinding(config, 'dist', { min: 1, max: 20, step: 0.5 });
pane.addBinding(config, 'sw', { min: 0, max: 2, step: 0.1 });
pane.addBinding(config, 'sc');
pane.addBinding(config, 'bg');

function layerColor(layer: number): string {
  return config.colors[layer % config.colors.length];
}

function shadeColor(color: string, amount: number): string {
  // Parse hex color and apply brightness adjustment
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

// Determine which face of the diamond a voxel belongs to and return shade amount
function getDiamondFaceShade(x: number, z: number): number {
  // 4 faces of the diamond based on quadrant
  // Simulating light from top-right
  if (x >= 0 && z <= 0) return 0; // front-right face (brightest)
  if (x >= 0 && z > 0) return -25; // back-right face
  if (x < 0 && z <= 0) return -40; // front-left face
  return -60; // back-left face (darkest)
}

interface Voxel {
  x: number;
  y: number;
  z: number;
  layer: number;
}

function generateDiamond(layers: number): Voxel[] {
  const baseRadius = layers - 1;
  const voxels: Voxel[] = [];

  for (let layer = 0; layer < layers; layer++) {
    const radius = baseRadius - layer;
    for (let r = -radius; r <= radius; r++) {
      for (let c = -radius; c <= radius; c++) {
        if (Math.abs(c) + Math.abs(r) > radius) continue;
        // Top half
        voxels.push({ x: c, z: r, y: -layer, layer });
        // Bottom half (mirror, skip shared base at layer 0)
        if (layer > 0) {
          voxels.push({ x: c, z: r, y: layer, layer });
        }
      }
    }
  }
  return voxels;
}

function buildScene(rotationAngle: number): Face[] {
  const layers = config.layers;
  const baseRadius = layers - 1;

  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'oblique', angle: config.angle, distance: config.dist },
  });

  const ss = { stroke: config.sc, strokeWidth: config.sw };
  const voxels = generateDiamond(layers);

  // Rotate around Y and snap to grid
  const cos = Math.cos(rotationAngle);
  const sin = Math.sin(rotationAngle);
  const occupied = new Set<string>();

  for (const v of voxels) {
    const rx = Math.round(v.x * cos - v.z * sin);
    const rz = Math.round(v.x * sin + v.z * cos);
    const key = `${rx},${v.y},${rz}`;
    if (occupied.has(key)) continue;
    occupied.add(key);

    const color = layerColor(v.layer);
    const faceShade = getDiamondFaceShade(rx, rz);
    const shadedColor = shadeColor(color, faceShade);
    const topColor = shadedColor;
    const rightColor = shadeColor(shadedColor, -20);
    const leftColor = shadeColor(shadedColor, -40);

    h.addBox({
      position: [rx + baseRadius, v.y, rz + baseRadius],
      size: [1, 1, 1],
      style: {
        default: { fill: shadedColor, ...ss },
        top: { fill: topColor, ...ss },
        left: { fill: leftColor, ...ss },
        right: { fill: rightColor, ...ss },
      },
    });
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
    if (face.type === 'content' || face.points.length === 0) continue;

    ctx.beginPath();
    ctx.moveTo(face.points[0][0] + ox, face.points[0][1] + oy);
    for (let i = 1; i < face.points.length; i++) {
      ctx.lineTo(face.points[i][0] + ox, face.points[i][1] + oy);
    }
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
  for (const { points } of faces) {
    for (const [px, py] of points) {
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

    const rotation = playhead * Math.PI * 2;
    const faces = buildScene(rotation);
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
  duration: 3_000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
