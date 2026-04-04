import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { setupPenplotExport } from '../../penplot/render-penplot';
import { getDimensionsFromPreset } from '../../penplot/distances';

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

const units = 'cm';
const [physicalWidth, physicalHeight] = getDimensionsFromPreset('a4', units);

const config = {
  threads: 24,
  baseDepth: 1,
  raiseDepth: 4,
  tileSize: 30,
  cameraAngle: 45,
  cameraDistance: 3,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;
pane.addBinding(config, 'threads', { min: 8, max: 60, step: 1 });
pane.addBinding(config, 'baseDepth', { min: 1, max: 10, step: 1 });
pane.addBinding(config, 'raiseDepth', { min: 1, max: 20, step: 1 });
pane.addBinding(config, 'tileSize', { min: 5, max: 50, step: 1 });
pane.addBinding(config, 'cameraAngle', { min: 0, max: 360, step: 1 });
pane.addBinding(config, 'cameraDistance', { min: 1, max: 30, step: 1 });

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
  };
}

function buildScene(): { h: Heerich; faces: Face[] } {
  const n = config.threads;
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: {
      type: 'oblique',
      angle: config.cameraAngle,
      distance: config.cameraDistance,
    },
  });

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const isWarp = pattern(c, r, 0);
      const d = isWarp ? config.raiseDepth : config.baseDepth;

      h.applyGeometry({
        type: 'box',
        position: [c, r, -(d - 1)],
        size: [1, 1, d],
        style: {
          default: { fill: 'white', stroke: 'black' },
        },
      });
    }
  }

  return { h, faces: h.getFaces() as Face[] };
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
    if (face.type === 'content') continue;
    const d = face.points.data;
    for (let i = 0; i < d.length; i += 2) {
      const px = d[i], py = d[i + 1];
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

/**
 * Build a Heerich instance and return it along with its SVG output.
 * Uses toSVG() directly for plotter-ready SVG export.
 */
function buildSvg(h: Heerich): string {
  const bounds = h.getViewBoxBounds();
  const sceneW = bounds.w;
  const sceneH = bounds.h;

  // Scale scene to fit within physical paper with margin
  const margin = 1; // 1cm margin
  const availW = physicalWidth - margin * 2;
  const availH = physicalHeight - margin * 2;
  const scale = Math.min(availW / sceneW, availH / sceneH);

  const scaledW = sceneW * scale;
  const scaledH = sceneH * scale;

  // Compute viewBox so the scene is centered on the physical page
  const vbX = bounds.x - (physicalWidth / scale - sceneW) / 2;
  const vbY = bounds.y - (physicalHeight / scale - sceneH) / 2;
  const vbW = physicalWidth / scale;
  const vbH = physicalHeight / scale;

  const svg = h.toSVG({
    padding: 0,
    viewBox: [vbX, vbY, vbW, vbH],
  });

  // Replace the style attribute with physical dimensions
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

    // Canvas preview
    const bounds = computeBounds(faces);
    const sceneW = bounds.maxX - bounds.minX;
    const sceneH = bounds.maxY - bounds.minY;
    const offsetX = (width - sceneW) / 2 - bounds.minX;
    const offsetY = (height - sceneH) / 2 - bounds.minY;

    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'black';
    context.lineWidth = 1;
    drawFaces(context, faces, offsetX, offsetY);

    // SVG for plotter export
    latestSvg = buildSvg(h);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, Math.round(1080 * (physicalHeight / physicalWidth))],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
