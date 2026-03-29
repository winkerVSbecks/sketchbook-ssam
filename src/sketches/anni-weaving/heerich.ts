import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { randomPalette } from '../../colors';

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

type PatternFn = (c: number, r: number, offset: number) => boolean;

// --- Pattern functions (from weaves.ts) ---

function makeTwill(s: number, o: number): PatternFn {
  return (c, r, offset) => (((c - r + offset + 10000 * s) % s) + s) % s < o;
}

function makeHerringbone(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const rMod = ((r % period) + period) % period;
    const rFolded = rMod < s ? rMod : 2 * s - rMod - 1;
    return (((c - rFolded + offset + 10000 * s) % s) + s) % s < o;
  };
}

function makeDiamond(s: number): PatternFn {
  const half = s / 2;
  const o = Math.max(1, Math.floor(s / 4));
  return (c, r, offset) => {
    const raw = (((c - r + offset + 10000 * s) % s) + s) % s;
    const folded = raw < half ? raw : s - raw;
    return folded < o;
  };
}

function makeHoundstooth(scale: number): PatternFn {
  const m = [
    [1, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 1, 1, 0],
  ];
  return (c, r, _offset) => {
    const row = ((Math.floor(r / scale) % 4) + 4) % 4;
    const col = ((Math.floor(c / scale) % 4) + 4) % 4;
    return m[row][col] === 1;
  };
}

function makeBasket(n: number): PatternFn {
  return (c, r, _offset) => {
    const cGroup = Math.floor(c / n);
    const rGroup = Math.floor(r / n);
    return (cGroup + rGroup) % 2 === 0;
  };
}

function makeBrokenTwill(s: number, o: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const cMod = ((c % period) + period) % period;
    const dir = cMod < s ? 1 : -1;
    return (((dir * (c - r) + offset + 10000 * s) % s) + s) % s < o;
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function satinStep(s: number): number {
  for (let step = 2; step < s - 1; step++) {
    if (gcd(step, s) === 1) return step;
  }
  return 2;
}

function makeSatin(s: number): PatternFn {
  const step = satinStep(s);
  return (c, r, offset) =>
    (((c - r * step + Math.floor(offset) + 10000 * s) % s) + s) % s < 1;
}

function makeCheckerboard(): PatternFn {
  return (c, r, _offset) => (c + r) % 2 === 0;
}

function makeWaffle(s: number): PatternFn {
  return (c, r, _offset) => {
    const cm = ((c % s) + s) % s;
    const rm = ((r % s) + s) % s;
    return cm === 0 || rm === 0;
  };
}

function makeZigzag(s: number, amplitude: number): PatternFn {
  const period = 2 * amplitude;
  return (c, r, offset) => {
    const rMod = ((r % period) + period) % period;
    const zigzagOffset = rMod < amplitude ? rMod : period - rMod;
    const shift = offset * s;
    return (
      (((c - zigzagOffset + shift + 10000 * s) % s) + s) % s < Math.ceil(s / 2)
    );
  };
}

function makeOvershot(blockSize: number): PatternFn {
  const period = blockSize * 2;
  return (c, r, _offset) => {
    const cm = ((c % period) + period) % period;
    const rm = ((r % period) + period) % period;
    const inBlock =
      cm >= blockSize / 2 &&
      cm < (blockSize * 3) / 2 &&
      rm >= blockSize / 2 &&
      rm < (blockSize * 3) / 2;
    if (inBlock) {
      const bc = cm - blockSize / 2;
      const br = rm - blockSize / 2;
      const center = blockSize / 2;
      const dist = Math.abs(bc - center) + Math.abs(br - center);
      return dist < center;
    }
    return (c + r) % 2 === 0;
  };
}

function makeBirdsEye(s: number): PatternFn {
  const period = s * 2;
  return (c, r, _offset) => {
    const cm = ((c % period) + period) % period;
    const rm = ((r % period) + period) % period;
    const cx = cm < s ? cm : period - cm - 1;
    const cy = rm < s ? rm : period - rm - 1;
    return cx + cy < Math.max(1, Math.floor(s / 2));
  };
}

function makeRosepath(s: number): PatternFn {
  const period = 2 * s;
  return (c, r, offset) => {
    const wave = Math.floor(Math.sin((r / s) * Math.PI) * (s / 2));
    const shifted = c - wave + offset;
    const rMod = ((r % period) + period) % period;
    const rFolded = rMod < s ? rMod : 2 * s - rMod - 1;
    return (((shifted - rFolded + 10000 * s) % s) + s) % s < Math.ceil(s / 3);
  };
}

function makeConcentricDiamond(s: number): PatternFn {
  const half = Math.floor(s / 2);
  return (c, r, _offset) => {
    const cm = ((c % s) + s) % s;
    const rm = ((r % s) + s) % s;
    const dx = cm < half ? cm : s - 1 - cm;
    const dy = rm < half ? rm : s - 1 - rm;
    const ring = Math.min(dx, dy);
    return ring % 2 === 0;
  };
}

function makeLace(s: number): PatternFn {
  return (c, r, offset) => {
    const cm = (((c + offset) % s) + s) % s;
    const rm = ((r % s) + s) % s;
    return cm === 0 && rm % 2 === 0;
  };
}

function makePointTwillDiamond(s: number): PatternFn {
  const period = 2 * (s - 1);
  return (c, r, offset) => {
    const cm = ((c % period) + period) % period;
    const rm = ((r % period) + period) % period;
    const cFolded = cm < s ? cm : period - cm;
    const rFolded = rm < s ? rm : period - rm;
    const shift = offset * s;
    return (
      (((cFolded - rFolded + shift + 10000 * s) % s) + s) % s < Math.ceil(s / 3)
    );
  };
}

// Pick one pattern
const shaft = Random.pick([4, 6, 8]);
const over = Random.rangeFloor(1, shaft);

const pattern: PatternFn = Random.pick([
  () => makeTwill(shaft, over),
  () => makeHerringbone(shaft, over),
  () => makeDiamond(shaft),
  () => makeHoundstooth(Random.rangeFloor(1, 3)),
  () => makeBasket(Random.rangeFloor(2, 4)),
  () => makeBrokenTwill(shaft, over),
  () => makeSatin(shaft),
  () => makeCheckerboard(),
  () => makeWaffle(Random.pick([3, 4, 5, 6])),
  () => makeZigzag(shaft, Random.pick([3, 4, 6])),
  () => makeOvershot(Random.pick([4, 6, 8])),
  () => makeBirdsEye(Random.pick([3, 4, 5])),
  () => makeRosepath(Random.pick([4, 6, 8])),
  () => makeConcentricDiamond(Random.pick([6, 8, 10, 12])),
  () => makeLace(Random.pick([3, 4, 5])),
  () => makePointTwillDiamond(Random.pick([6, 8, 10])),
])();

const palette = randomPalette();
const [warpColor, weftColor, bgColor] = Random.shuffle(palette).slice(0, 3);

const config = {
  threads: 24,
  depth: 24,
  tileSize: 30,
  cameraAngle: Random.range(0, 90),
  cameraDistance: Random.range(4, 12),
  strokeWidth: 0.5,
  strokeColor: '#333333',
  bg: bgColor,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'threads', { min: 8, max: 60, step: 1 });
pane.addBinding(config, 'depth', { min: 1, max: 60, step: 1 });
pane.addBinding(config, 'tileSize', { min: 5, max: 50, step: 1 });
pane.addBinding(config, 'cameraAngle', { min: 0, max: 90, step: 1 });
pane.addBinding(config, 'cameraDistance', { min: 1, max: 30, step: 1 });
pane.addBinding(config, 'strokeWidth', { min: 0, max: 2, step: 0.1 });
pane.addBinding(config, 'strokeColor');
pane.addBinding(config, 'bg');

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

function buildScene(playhead: number): Face[] {
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: {
      type: 'oblique',
      angle: config.cameraAngle,
      distance: config.cameraDistance,
    },
  });

  const n = config.threads;
  const d = config.depth;

  const strokeStyle = {
    stroke: config.strokeColor,
    strokeWidth: config.strokeWidth,
  };

  for (let z = 0; z < d; z++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        // Front/back faces: pattern mapped to (c, r)
        const fb = pattern(c, r, playhead) ? warpColor : weftColor;
        // Left/right faces: pattern mapped to (z, r)
        const lr = pattern(z, r, playhead) ? warpColor : weftColor;
        // Top/bottom faces: pattern mapped to (c, z)
        const tb = pattern(c, z, playhead) ? warpColor : weftColor;

        h.addBox({
          position: [c, r, z],
          size: [1, 1, 1],
          style: {
            default: { fill: fb, ...strokeStyle },
            front: { fill: fb, ...strokeStyle },
            back: { fill: fb, ...strokeStyle },
            left: { fill: lr, ...strokeStyle },
            right: { fill: lr, ...strokeStyle },
            top: { fill: tb, ...strokeStyle },
            bottom: { fill: tb, ...strokeStyle },
          },
        });
      }
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

function computeBounds(faces: Face[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
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

    config.cameraAngle = (playhead * 360) % 360; // Rotate camera around the scene

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
  duration: 4000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
