import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import Random from 'canvas-sketch-util/random';
import { cuspPalette, describe } from '../../colors/cusphanger';

/**
 * cusp-tiers — fork of panna-meena shaded by cusphanger's contrast tiers.
 *
 * The stepped Panna Meena ka Kund wedges are unchanged; the light model is
 * the palette's. On a tinted light ground, every tread takes the low tier
 * (≈1.6:1, a wash just off the paper), the lit right-hand sides the mid tier
 * (≈4.5:1) and the shadowed lower sides the high tier (≈9:1 ink). Each of the `count` rows of wedges takes the next of the
 * palette's hues, so the three tiers repeat down the canvas in each hue.
 * Rendered on a Display P3 canvas.
 */

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

interface Face {
  type: string;
  points: { data: number[] };
  depth: number;
  style: { fill?: string; stroke?: string; strokeWidth?: number };
}

type FaceStyle = { fill: string; stroke: string; strokeWidth: number };

const palette = cuspPalette({ ground: 'light', count: 3 });
console.log(describe(palette));

const config = {
  res: 40,
  count: 8,
  tileSize: 16,
  angle: 35,
  dist: 9,
  sw: 0.4,
  bg: palette.bg.css,
};

// One style per palette hue. The oblique camera looks down the z axis, so the
// faces turned to it (heerich's front/back) are the treads: wash. Of the
// sides it can see, the right (x+) ones catch the light: accent; the y+
// ones fall in shadow: ink, as do the hidden left and y− faces.
const hueStyles = palette.hues.map((_, i): Record<string, FaceStyle> => {
  const stroke = { stroke: config.bg, strokeWidth: config.sw };
  const low = palette.tiers.low[i].css;
  const mid = palette.tiers.mid[i].css;
  const high = palette.tiers.high[i].css;
  return {
    default: { fill: low, ...stroke },
    front: { fill: low, ...stroke },
    back: { fill: low, ...stroke },
    top: { fill: high, ...stroke },
    left: { fill: high, ...stroke },
    right: { fill: mid, ...stroke },
    bottom: { fill: high, ...stroke },
  };
});

function buildScene(): Face[] {
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'oblique', angle: config.angle, distance: config.dist },
  });

  const period = config.res / config.count;
  const nHues = hueStyles.length;

  // Add a back wall of height maxH to hide the faces of boxes at the back of the scene
  h.applyGeometry({
    type: 'box',
    position: [0, 0, 0],
    size: [config.res, config.res, 1],
    style: hueStyles[0],
  });

  for (let y = 0; y < config.count; y++) {
    const style = hueStyles[y % nHues];
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
            style,
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
            style,
          });
        }
      }
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

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.bg;
    context.fillRect(0, 0, width, height);

    const faces = buildScene();

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
  animate: false,
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);
