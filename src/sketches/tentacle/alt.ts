import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../../subtractive-color';
import { clamp, lerp, lerpFrames, mapRange } from 'canvas-sketch-util/math';
import smooth from 'chaikin-smooth';
import getNormals from 'polyline-normals';
import { drawPath } from '@daeinc/draw';

let config = {
  cycles: 4,
  pathCount: 5,
  uniform: Random.chance(0.5),
  spread: 60,
};

const a = Random.rangeFloor(0, 4);
const b = 6 - a;
function wobbly(x: number, t: number) {
  return Math.sin(a * x + b * t + 5) + Math.sin(b * x + a * t + 4);
}

interface Tentacle {
  normals: [Point, number][];
  points: Line;
  shape: Point[];
  color: string;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColors();
  const bg = colors.pop()!;
  const tentacles = Array.from({ length: config.pathCount }).map((_, idx) => {
    const yMin = Random.range(0, height);
    const yMax = clamp(Random.range(0, yMin + 0.4 * height), 0, height);

    const points = generateTentacle([0, width], [yMin, yMax], 10);
    const normals = getNormals(points);

    const shapeA: Point[] = [];
    const shapeB: Point[] = [];

    for (let idx = 0; idx < points.length; idx++) {
      const normal = normals[idx][0];
      const point = points[idx];
      const t = lerpFrames([0, 1, 0], idx / (points.length - 1));

      const spread = mapRange(t, 0, 1, 0, config.spread);
      shapeA.push([
        point[0] + normal[0] * spread,
        point[1] + normal[1] * spread,
      ]);
      shapeB.push([
        point[0] - normal[0] * spread,
        point[1] - normal[1] * spread,
      ]);
    }

    const shape = [...shapeA, ...shapeB.reverse()];

    return {
      points,
      normals,
      shape,
      color: Random.pick(colors),
    };
  });

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 20;
    context.lineJoin = 'round';

    tentacles.forEach(({ shape, color }) => {
      context.fillStyle = color;
      context.strokeStyle = color;
      context.beginPath();
      drawPath(context, shape);
      context.closePath();
      context.fill();
      context.stroke();
    });
  };
};

function generateTentacle(
  [x1, x2]: [number, number],
  [yMin, yMax]: [number, number],
  steps: number,
  iterations = 6
): Line {
  const y1 = Random.range(yMin, yMax);
  const y2 = Random.range(yMin, yMax);

  const delta = (yMax - yMin) / 4;

  // Equally spaced points
  const path: Line = Array.from({ length: steps }, (_, idx) => {
    return [lerp(x1, x2, (idx + 1) / steps), lerp(y1, y2, (idx + 1) / steps)];
  })
    // Add variation to points
    .map(([x, y]) => [x, y + Random.range(-delta, delta)]);

  // Smooth path
  let output = path;
  for (let index = 0; index < iterations; index++) {
    output = smooth(output);
  }

  return output;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 6_000 * config.cycles,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
