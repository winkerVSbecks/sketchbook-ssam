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

// Pixel font: 5 columns × 9 rows, '#' = voxel present, '.' = empty
// Row 0 = top of letter, row 7 = bottom, row 8 = blank padding row
const FONT: Record<string, string[]> = {
  // prettier-ignore
  A: [
    '####',
    '#..#',
    '#..#',
    '####',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '....',
  ],
  // prettier-ignore
  B: [
    '####',
    '#..#',
    '####',
    '##..',
    '####',
    '#..#',
    '#..#',
    '####',
    '.....',
  ],
  // prettier-ignore
  C: [
    '####',
    '#..#',
    '#...',
    '#...',
    '#...',
    '#...',
    '#..#',
    '####',
    '....',
  ],
  // prettier-ignore
  D: [
    '###.',
    '#.##',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#.##',
    '###.',
    '....',
  ],
  // prettier-ignore
  E: [
    '###',
    '#..',
    '#..',
    '##.',
    '#..',
    '#..',
    '#..',
    '###',
    '.....',
  ],
  // prettier-ignore
  F: [
    '###',
    '#..',
    '#..',
    '##.',
    '#..',
    '#..',
    '#..',
    '#..',
    '...',
  ],
  // prettier-ignore
  G: [
    '####',
    '#..#',
    '#...',
    '#...',
    '#.##',
    '#..#',
    '#..#',
    '####',
    '....',
  ],
  // prettier-ignore
  H: [
    '#..#',
    '#..#',
    '#..#',
    '####',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '....',
  ],
  // prettier-ignore
  I: [
    '###',
    '.#.',
    '.#.',
    '.#.',
    '.#.',
    '.#.',
    '.#.',
    '###',
    '...',
  ],
  // prettier-ignore
  J: [
    '..##',
    '...#',
    '...#',
    '...#',
    '...#',
    '...#',
    '#..#',
    '####',
    '.....',
  ],
  // prettier-ignore
  K: [
    '#..#',
    '#..#',
    '####',
    '##..',
    '####',
    '#..#',
    '#..#',
    '#..#',
    '....',
  ],
  // prettier-ignore
  L: [
    '#..',
    '#..',
    '#..',
    '#..',
    '#..',
    '#..',
    '#..',
    '###',
    '...',
  ],
  M: [
    '###.###',
    '#.#.#.#',
    '#.#.#.#',
    '#.###.#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '.......',
  ],
  N: [
    '###.#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#.###',
    '......',
  ],
  // prettier-ignore
  O: [
    '####',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '####',
    '....',
  ],
  // prettier-ignore
  P: [
    '####',
    '#..#',
    '#..#',
    '#..#',
    '####',
    '#...',
    '#...',
    '#...',
    '....',
  ],
  // prettier-ignore
  Q: [
    '####',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#.##',
    '####',
    '....',
  ],
  R: [
    '####',
    '#..#',
    '#.##',
    '#.#..',
    '#.##.',
    '#..#.',
    '#..#.',
    '#..#.',
    '.....',
  ],
  // prettier-ignore
  S: [
    '####',
    '#...',
    '#...',
    '####',
    '...#',
    '...#',
    '...#',
    '####',
    '.....',
  ],
  T: [
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '.....',
  ],
  // prettier-ignore
  U: [
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '#..#',
    '####',
    '....',
  ],
  V: [
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '##.##',
    '.#.#.',
    '.###.',
    '.....',
  ],
  W: [
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.###.#',
    '#.#.#.#',
    '#.#.#.#',
    '###.###',
    '.....',
  ],
  X: [
    '#...#',
    '#...#',
    '#####',
    '..#..',
    '..#..',
    '#####',
    '#...#',
    '#...#',
    '.....',
  ],
  Y: [
    '#...#',
    '#...#',
    '#...#',
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '.....',
  ],
  // prettier-ignore
  Z: [
    '####',
    '...#',
    '...#',
    '####',
    '#...',
    '#...',
    '#...',
    '####',
    '.....',
  ],
};

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

const palette = Random.shuffle(randomPalette());
const [bg, faceColor, topColor, shadeColor] = palette;

const config = {
  text: 'HEERICH',
  axis: 'Y' as 'X' | 'Y' | 'Z',
  // Letter shape controls
  letterW: 1, // voxels per bitmap column (X stretch)
  letterH: 1, // voxels per bitmap row (Y stretch)
  voxelH: 8, // extrusion height of each column
  // Layout
  cols: 7, // letters per row
  gapX: 3, // gap between letters in X
  gapY: 3, // gap between letters in Y
  // Rendering
  tileSize: 20,
  dist: 3,
  sw: 0.3,
  sc: 'rgba(0,0,0,0.15)',
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

const textFolder = pane.addFolder({ title: 'Text' });
textFolder.addBinding(config, 'text', { label: 'text' });
textFolder.addBinding(config, 'axis', {
  label: 'axis',
  options: { X: 'X', Y: 'Y', Z: 'Z' },
});

const letterFolder = pane.addFolder({ title: 'Letter Shape' });
letterFolder.addBinding(config, 'letterW', {
  min: 1,
  max: 4,
  step: 1,
  label: 'width',
});
letterFolder.addBinding(config, 'letterH', {
  min: 1,
  max: 4,
  step: 1,
  label: 'height',
});
letterFolder.addBinding(config, 'voxelH', {
  min: 1,
  max: 20,
  step: 1,
  label: 'extrusion',
});

const layoutFolder = pane.addFolder({ title: 'Layout' });
layoutFolder.addBinding(config, 'cols', { min: 1, max: 13, step: 1 });
layoutFolder.addBinding(config, 'gapX', { min: 0, max: 10, step: 1 });
layoutFolder.addBinding(config, 'gapY', { min: 0, max: 10, step: 1 });

const renderFolder = pane.addFolder({ title: 'Render' });
renderFolder.addBinding(config, 'tileSize', { min: 4, max: 40, step: 1 });
renderFolder.addBinding(config, 'dist', { min: 1, max: 10, step: 0.5 });
renderFolder.addBinding(config, 'sw', { min: 0, max: 2, step: 0.1 });

function getTextChars(): string[] {
  return config.text
    .toUpperCase()
    .split('')
    .filter((c) => c === ' ' || c in FONT);
}

function buildScene(playhead: number): Face[] {
  const a = playhead * 360;
  const camera =
    config.axis === 'X'
      ? { type: 'orthographic' as const, angle: 45, pitch: a }
      : config.axis === 'Z'
        ? { type: 'orthographic' as const, angle: 45, pitch: 35.264 }
        : { type: 'orthographic' as const, angle: a, pitch: 35.264 };

  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera,
  });

  const ss = { stroke: config.sc, strokeWidth: config.sw };
  const { letterW, letterH, voxelH, gapX, gapY } = config;

  const stepY = 9 * letterH + gapY;
  const chars = getTextChars();

  // Pre-compute x offset for each character using its actual bitmap width
  const xOffsets: number[] = [];
  let rowX = 0;
  chars.forEach((char, idx) => {
    if (idx % config.cols === 0) rowX = 0;
    xOffsets.push(rowX);
    if (char === ' ') {
      rowX += 4 * letterW + gapX;
    } else {
      rowX += FONT[char][0].length * letterW + gapX;
    }
  });

  chars.forEach((char, idx) => {
    if (char === ' ') return;

    const row = Math.floor(idx / config.cols);
    const ox = xOffsets[idx];
    const oy = row * stepY;

    const bitmap = FONT[char];
    for (let by = 0; by < 9; by++) {
      for (let bx = 0; bx < bitmap[by].length; bx++) {
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

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    const faces = buildScene(playhead);
    const { minX, minY, maxX, maxY } = sceneBounds(faces);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const ox = (width - (maxX - minX)) / 2 - minX;
    const oy = (height - (maxY - minY)) / 2 - minY;

    if (config.axis === 'Z') {
      context.save();
      context.translate(width / 2, height / 2);
      context.rotate(playhead * Math.PI * 2);
      context.translate(-width / 2, -height / 2);
      drawFaces(context, faces, ox, oy);
      context.restore();
    } else {
      drawFaces(context, faces, ox, oy);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
