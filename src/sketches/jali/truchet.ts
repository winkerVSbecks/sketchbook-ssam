import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { formatHex } from 'culori';
import { drawPath } from '@daeinc/draw';
import { clrs } from '../../colors/clrs';
import { palettes as autoAlbers } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';

const config = {
  resolution: 32,
  scale: 1,
  offset: 50,
};

const colors = Random.shuffle(
  Random.chance()
    ? generateColors(6)
    : Random.pick([...autoAlbers, ...mindfulPalettes, ...clrs])
);
const bg = colors.shift()!;
const frame = colors.shift()!;
const jali = colors.shift()!;
const frameSide = colors.shift()!;
const outside = colors.shift()!;

const tiles = [
  (x: number, y: number, w: number, h: number) => {
    const s = [w / 4, h / 4];
    return [
      [0, 4],
      [1, 3],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 1],
      [4, 0],
    ].map(([dx, dy]) => [x + dx * s[0], y + dy * s[1]]);
  },
  (x: number, y: number, w: number, h: number) => {
    const s = [w / 4, h / 4];
    return [
      [0, 0],
      [1, 1],
      [2, 1],
      [2, 2],
      [2, 3],
      [3, 3],
      [4, 4],
    ].map(([dx, dy]) => [x + dx * s[0], y + dy * s[1]]);
  },
  (x: number, y: number, w: number, h: number) => {
    const s = [w / 4, h / 4];
    return [
      [0, 4],
      [1, 3],
      [2, 3],
      [2, 2],
      [2, 1],
      [3, 1],
      [4, 0],
    ].map(([dx, dy]) => [x + dx * s[0], y + dy * s[1]]);
  },
  (x: number, y: number, w: number, h: number) => {
    const s = [w / 4, h / 4];
    return [
      [0, 0],
      [1, 1],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 3],
      [4, 4],
    ].map(([dx, dy]) => [x + dx * s[0], y + dy * s[1]]);
  },
];

export const sketch = async ({ wrap, context, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const w = width / config.resolution;
    const h = height / config.resolution;

    const y1 = height * 0.35;
    const y2 = height * 0.9;
    const y3 = height * 0.1;

    const x1 = width * 0.25;
    const x2 = width * 0.75;
    const x3 = width * 0.5;

    context.translate(width / 2, height / 2);
    context.scale(config.scale, config.scale);
    context.translate(-width / 2, -height / 2);
    context.translate(-config.offset / 2, 0);

    // Jali shell (arch style window)
    context.fillStyle = outside; //colors[3]!;
    context.save();
    context.beginPath();
    context.moveTo(x1, y2);
    context.lineTo(x2, y2);
    context.lineTo(x2, y1);
    context.bezierCurveTo(x2, y1 * 0.8, x2, y1 * 0.8, x3, y3);
    context.bezierCurveTo(x1, y1 * 0.8, x1, y1 * 0.8, x1, y1);
    context.closePath();
    context.fill();
    context.clip();

    // Jali itself
    context.strokeStyle = jali; //colors[1]!;
    for (let x = 0; x < width; x += w) {
      for (let y = 0; y < height; y += h) {
        const tile = Random.pick(tiles);
        context.beginPath();
        drawPath(context, tile(x, y, w, h));
        context.stroke();
      }
    }

    context.restore();

    context.strokeStyle = frame; //colors[0]!;
    context.beginPath();
    context.moveTo(x3, y3);
    context.bezierCurveTo(x1, y1 * 0.8, x1, y1 * 0.8, x1, y1);
    context.lineTo(x1, y2);
    context.lineTo(x2, y2);
    context.stroke();

    context.fillStyle = frameSide; //colors[2]!;
    context.strokeStyle = frameSide; //colors[2]!;
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2, y1);
    context.bezierCurveTo(x2, y1 * 0.8, x2, y1 * 0.8, x3, y3);
    context.lineTo(x3 + config.offset * 1.25, y3);
    context.bezierCurveTo(
      x2 + config.offset,
      y1 * 0.8,
      x2 + config.offset,
      y1 * 0.8,
      x2 + config.offset,
      y1
    );
    context.lineTo(x2 + config.offset, y2);
    context.lineTo(x2, y2);
    context.fill();
    context.stroke();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);

function generateColors(count: number) {
  const colors = generateColorRamp({
    total: count,
  })
    .reverse()
    .map((color) => formatHex(colorToCSS(color, 'hsl')));

  return colors;
}
