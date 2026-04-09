import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import { Pane } from 'tweakpane';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../colors';

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

// Pixel font: 7 columns × 9 rows, '#' = voxel present, '.' = empty
// Row 0 = top of letter, row 7 = bottom, row 8 = blank padding row
const FONT: Record<string, string[]> = {
  A: [
    '...#...',
    '..#.#..',
    '.#...#.',
    '#.....#',
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '.......',
  ],
  B: [
    '######.',
    '#.....#',
    '#.....#',
    '######.',
    '#.....#',
    '#.....#',
    '#.....#',
    '######.',
    '.......',
  ],
  C: [
    '.#####.',
    '#.....#',
    '#......',
    '#......',
    '#......',
    '#......',
    '#.....#',
    '.#####.',
    '.......',
  ],
  D: [
    '######.',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '######.',
    '.......',
  ],
  E: [
    '#######',
    '#......',
    '#......',
    '#####..',
    '#......',
    '#......',
    '#......',
    '#######',
    '.......',
  ],
  F: [
    '#######',
    '#......',
    '#......',
    '#####..',
    '#......',
    '#......',
    '#......',
    '#......',
    '.......',
  ],
  G: [
    '.#####.',
    '#.....#',
    '#......',
    '#......',
    '#..####',
    '#.....#',
    '#.....#',
    '.#####.',
    '.......',
  ],
  H: [
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '.......',
  ],
  I: [
    '#######',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '#######',
    '.......',
  ],
  J: [
    '#######',
    '.....#.',
    '.....#.',
    '.....#.',
    '.....#.',
    '#....#.',
    '#....#.',
    '.####..',
    '.......',
  ],
  K: [
    '#.....#',
    '#....#.',
    '#...#..',
    '####...',
    '#...#..',
    '#....#.',
    '#.....#',
    '#.....#',
    '.......',
  ],
  L: [
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#......',
    '#######',
    '.......',
  ],
  M: [
    '#.....#',
    '##...##',
    '#.#.#.#',
    '#..#..#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '.......',
  ],
  N: [
    '#.....#',
    '##....#',
    '#.#...#',
    '#..#..#',
    '#...#.#',
    '#....##',
    '#.....#',
    '#.....#',
    '.......',
  ],
  O: [
    '.#####.',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '.#####.',
    '.......',
  ],
  P: [
    '######.',
    '#.....#',
    '#.....#',
    '######.',
    '#......',
    '#......',
    '#......',
    '#......',
    '.......',
  ],
  Q: [
    '.#####.',
    '#.....#',
    '#.....#',
    '#.....#',
    '#..#..#',
    '#...#.#',
    '#....##',
    '.######',
    '.......',
  ],
  R: [
    '######.',
    '#.....#',
    '#.....#',
    '######.',
    '#...#..',
    '#....#.',
    '#.....#',
    '#.....#',
    '.......',
  ],
  S: [
    '.######',
    '#......',
    '#......',
    '.#####.',
    '......#',
    '......#',
    '......#',
    '######.',
    '.......',
  ],
  T: [
    '#######',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '.......',
  ],
  U: [
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '.#####.',
    '.......',
  ],
  V: [
    '#.....#',
    '#.....#',
    '#.....#',
    '.#...#.',
    '.#...#.',
    '..#.#..',
    '..#.#..',
    '...#...',
    '.......',
  ],
  W: [
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#..#..#',
    '#.#.#.#',
    '##...##',
    '#.....#',
    '.......',
  ],
  X: [
    '#.....#',
    '#.....#',
    '.#...#.',
    '..#.#..',
    '...#...',
    '..#.#..',
    '.#...#.',
    '#.....#',
    '.......',
  ],
  Y: [
    '#.....#',
    '.#...#.',
    '..#.#..',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '...#...',
    '.......',
  ],
  Z: [
    '#######',
    '.....#.',
    '....#..',
    '...#...',
    '..#....',
    '.#.....',
    '#......',
    '#######',
    '.......',
  ],
};

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

const palette = Random.shuffle(randomPalette());
const [bg, faceColor, topColor, shadeColor] = palette;

const config = {
  // Letter shape controls
  letterW: 1,   // voxels per bitmap column (X stretch)
  letterH: 1,   // voxels per bitmap row (Y stretch)
  voxelH: 8,    // extrusion height of each column
  // Layout
  cols: 6,      // letters per row
  gapX: 3,      // gap between letters in X
  gapY: 3,      // gap between letters in Y
  // Rendering
  tileSize: 14,
  angle: 35,
  dist: 3,
  sw: 0.3,
  sc: 'rgba(0,0,0,0.15)',
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

const letterFolder = pane.addFolder({ title: 'Letter Shape' });
letterFolder.addBinding(config, 'letterW', { min: 1, max: 4, step: 1, label: 'width' });
letterFolder.addBinding(config, 'letterH', { min: 1, max: 4, step: 1, label: 'height' });
letterFolder.addBinding(config, 'voxelH', { min: 1, max: 20, step: 1, label: 'extrusion' });

const layoutFolder = pane.addFolder({ title: 'Layout' });
layoutFolder.addBinding(config, 'cols', { min: 1, max: 13, step: 1 });
layoutFolder.addBinding(config, 'gapX', { min: 0, max: 10, step: 1 });
layoutFolder.addBinding(config, 'gapY', { min: 0, max: 10, step: 1 });

const renderFolder = pane.addFolder({ title: 'Render' });
renderFolder.addBinding(config, 'tileSize', { min: 4, max: 40, step: 1 });
renderFolder.addBinding(config, 'angle', { min: 0, max: 90, step: 1 });
renderFolder.addBinding(config, 'dist', { min: 1, max: 10, step: 0.5 });
renderFolder.addBinding(config, 'sw', { min: 0, max: 2, step: 0.1 });

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function buildScene(): Face[] {
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'oblique', angle: config.angle, distance: config.dist },
  });

  const ss = { stroke: config.sc, strokeWidth: config.sw };
  const { letterW, letterH, voxelH, gapX, gapY } = config;

  // Each letter occupies 7*letterW wide, 9*letterH deep, plus gap
  const stepX = 7 * letterW + gapX;
  const stepY = 9 * letterH + gapY;

  LETTERS.forEach((letter, idx) => {
    const col = idx % config.cols;
    const row = Math.floor(idx / config.cols);
    const ox = col * stepX;
    const oy = row * stepY;

    const bitmap = FONT[letter];
    for (let by = 0; by < 9; by++) {
      for (let bx = 0; bx < 7; bx++) {
        if (bitmap[by][bx] === '#') {
          h.applyGeometry({
            type: 'box',
            position: [ox + bx * letterW, oy + by * letterH, -(voxelH - 1)],
            size: [letterW, letterH, voxelH],
            style: {
              default: { fill: faceColor, ...ss },
              front: { fill: faceColor, ...ss },
              back: { fill: faceColor, ...ss },
              top: { fill: topColor, ...ss },
              left: { fill: shadeColor, ...ss },
              right: { fill: shadeColor, ...ss },
              bottom: { fill: shadeColor, ...ss },
            },
          });
        }
      }
    }
  });

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

  // Cache faces; invalidate when any pane control changes
  let cached: {
    faces: Face[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null = null;

  pane.on('change', () => {
    cached = null;
  });

  wrap.render = ({ width, height }: SketchProps) => {
    if (!cached) {
      const faces = buildScene();
      const { minX, minY, maxX, maxY } = sceneBounds(faces);
      cached = { faces, minX, minY, maxX, maxY };
    }

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const { faces, minX, minY, maxX, maxY } = cached;
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
  playFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
