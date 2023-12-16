import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import {
  generateColorRamp,
  colorToCSS,
  colorHarmonies,
  GenerateColorRampArgument,
} from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import pack from 'pack-spheres';

type Point = { x: number; y: number };
type Spiral = { points: Point[]; color: string; lineWidth: number };

const hueStart = Random.rangeFloor(0, 360);
const [hStartBG, hStartA, hStartB] =
  colorHarmonies.splitComplementary(hueStart);

const colorParams: GenerateColorRampArgument = {
  total: 12,
  hStartCenter: 0.5,
  hEasing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  sRange: [0.2, 0.35],
  sEasing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  lRange: [0.5, 0.9],
  lEasing: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

const debug = false;
const PARAMS = {
  count: 175,
  cycles: 10,
  a: 40,
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colorsA = generateColorRamp({
    ...colorParams,
    hStart: hStartA,
  }).map((color) => colorToCSS(color, 'oklch'));

  const colorsB = generateColorRamp({
    ...colorParams,
    hStart: hStartB,
  }).map((color) => colorToCSS(color, 'oklch'));

  const bg = generateColorRamp({
    total: 1,
    hStart: hStartBG,
    ...colorParams,
    lRange: [0.1, 0.2],
  }).map((color) => colorToCSS(color, 'oklch'))[0];

  const size = Math.min(width, height);
  const margin = width * 0.1;
  const scale = 0.5 * size - margin;

  const shapes = pack({
    dimensions: 2,
    padding: 0.0025,
    minRadius: 0.03125,
    maxRadius: 0.5,
  });

  const circles = shapes.map((shape: any) => ({
    x: shape.position[0] * scale,
    y: shape.position[1] * scale,
    r: shape.radius * scale,
  }));

  const angles = Array.from({ length: 125 }, (_, i) => {
    return ((i + 1) / PARAMS.count) * 2 * Math.PI * PARAMS.cycles;
  });

  const spirals: Spiral[] = [];

  circles.forEach((c: any) => {
    let idx = 0;
    // let r = 0;
    let points: Point[] = [];

    // while (r < c.r) {
    //   idx++;
    //   r = fermat(c.r, ((idx + 1) / PARAMS.count) * 2 * Math.PI * PARAMS.cycles);
    //   points.push({
    //     x: Math.cos(idx) * r,
    //     y: Math.sin(idx) * r,
    //   });
    // }

    const spiral1 = {
      points: angles.map((angle) => {
        const r = fermat(c.r * 0.15, angle);
        return {
          x: c.x + Math.cos(angle) * r,
          y: c.y + Math.sin(angle) * r,
        };
      }),
      color: Random.pick(colorsA),
      lineWidth: c.r < 0.25 * scale ? 1 : 2,
    };
    const spiral2 = {
      points: angles.map((angle) => {
        const r = fermat(c.r * 0.15, angle, -1);
        return {
          x: c.x + Math.cos(angle) * r,
          y: c.y + Math.sin(angle) * r,
        };
      }),
      color: Random.pick(colorsB),
      lineWidth: c.r < 0.25 * scale ? 1 : 2,
    };

    spirals.push(spiral1, spiral2);
  });

  const stitch = (spiral: Spiral) => {
    const [start, ...points] = spiral.points;
    context.lineWidth = spiral.lineWidth;
    context.beginPath();
    context.moveTo(start.x, start.y);

    points.forEach((point: Point) => {
      context.lineTo(point.x, point.y);
    });

    context.strokeStyle = spiral.color;
    context.stroke();
  };

  wrap.render = ({ width, height, frame, playhead, time }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.save();
    context.translate(width / 2, height / 2);

    if (debug) {
      circles.forEach((c: any) => {
        context.beginPath();
        context.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        context.strokeStyle = 'red';
        context.stroke();
      });
    }

    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.setLineDash([5, 15]);
    context.lineDashOffset = -playhead * 20;
    spirals.forEach((spiral: Spiral) => {
      stitch(spiral);
    });

    context.restore();
  };
};

function fermat(a: number, t: number, direction = 1) {
  return direction * a * Math.pow(t, 0.5);
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [800, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 1_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch, settings);
