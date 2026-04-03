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
const [bg, shade, face, top] = palette;

// period = 2 * max_chebyshev_dist for one clean bowl→dome cycle
const config = {
  cols: 20,
  rows: 20,
  period: 20,
  minH: 1,
  maxH: 11,
  tileSize: 26,
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
pane.addBinding(config, 'cols', { min: 8, max: 40, step: 2 });
pane.addBinding(config, 'rows', { min: 8, max: 40, step: 2 });
pane.addBinding(config, 'period', { min: 6, max: 40, step: 2 });
pane.addBinding(config, 'minH', { min: 1, max: 6, step: 1 });
pane.addBinding(config, 'maxH', { min: 4, max: 24, step: 1 });
pane.addBinding(config, 'tileSize', { min: 8, max: 60, step: 1 });
pane.addBinding(config, 'angle', { min: 0, max: 90, step: 1 });
pane.addBinding(config, 'dist', { min: 1, max: 20, step: 0.5 });
pane.addBinding(config, 'sw', { min: 0, max: 2, step: 0.1 });
pane.addBinding(config, 'sc');
pane.addBinding(config, 'bg');
pane.addBinding(config, 'face');
pane.addBinding(config, 'top');
pane.addBinding(config, 'shade');

// Height at grid position (x, y) for a given scroll offset.
// Uses Chebyshev distance from center so each concentric square ring is one
// step taller/shorter than its neighbour — the staircase triangle profile of
// Panna Meena ka Kund. The tent wave makes the pattern cycle between
// bowl (center low, edges high) and dome (center high, edges low).
function colH(x: number, y: number, off: number): number {
  const { cols, rows, period, minH, maxH } = config;
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
  const phase = (((d - off) % period) + period) % period;
  const tent = Math.min(phase, period - phase); // 0 at centre, peaks at period/2
  const t = tent / (period / 2); // normalise to 0..1
  return Math.max(minH, Math.round(minH + t * (maxH - minH)));
}

function buildScene(playhead: number): Face[] {
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'oblique', angle: config.angle, distance: config.dist },
  });

  const off = playhead * config.period;
  const ss = { stroke: config.sc, strokeWidth: config.sw };

  for (let y = 0; y < config.rows; y++) {
    for (let x = 0; x < config.cols; x++) {
      const ht = colH(x, y, off);
      h.addBox({
        position: [x, y, -(ht - 1)],
        size: [1, 1, ht],
        style: {
          default: { fill: config.face, ...ss },
          front: { fill: config.face, ...ss },
          back: { fill: config.face, ...ss },
          top: { fill: config.top, ...ss },
          left: { fill: config.shade, ...ss },
          right: { fill: config.shade, ...ss },
          bottom: { fill: config.shade, ...ss },
        },
      });
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

    const faces = buildScene(playhead);
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
